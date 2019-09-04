/**
 * Default canvas painter
 * @module zrender/Painter
 * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
 *         errorrik (errorrik@gmail.com)
 *         pissang (https://www.github.com/pissang)
 */

import {devicePixelRatio} from './config';
import * as util from './core/util';
import log from './core/log';
import BoundingRect from './core/BoundingRect';
import timsort from './core/timsort';
import Layer from './Layer';
import requestAnimationFrame from './animation/requestAnimationFrame';
import Image from './graphic/Image';

// PENDIGN
// Layer exceeds MAX_PROGRESSIVE_LAYER_NUMBER may have some problem when flush directly second time.
//
// Maximum progressive layer. When exceeding this number. All elements will be drawed in the last layer.    最大累进层。超过这个数字。所有元素将在最后一层绘制。
var MAX_PROGRESSIVE_LAYER_NUMBER = 5;

function parseInt10(val) {
    return parseInt(val, 10);
}

function isLayerValid(layer) {
    if (!layer) {
        return false;
    }

    if (layer.__builtin__) {
        return true;
    }

    if (typeof(layer.resize) !== 'function'
        || typeof(layer.refresh) !== 'function'
    ) {
        return false;
    }

    return true;
}

function preProcessLayer(layer) {
    layer.__unusedCount++;
}

function postProcessLayer(layer) {
    if (layer.__unusedCount == 1) {
        layer.clear();
    }
}

var tmpRect = new BoundingRect(0, 0, 0, 0);
var viewRect = new BoundingRect(0, 0, 0, 0);
function isDisplayableCulled(el, width, height) {
    tmpRect.copy(el.getBoundingRect());
    if (el.transform) {
        tmpRect.applyTransform(el.transform);
    }
    viewRect.width = width;
    viewRect.height = height;
    return !tmpRect.intersect(viewRect);
}

function isClipPathChanged(clipPaths, prevClipPaths) {
    if (clipPaths == prevClipPaths) { // Can both be null or undefined
        return false;
    }

    if (!clipPaths || !prevClipPaths || (clipPaths.length !== prevClipPaths.length)) {
        return true;
    }
    for (var i = 0; i < clipPaths.length; i++) {
        if (clipPaths[i] !== prevClipPaths[i]) {
            return true;
        }
    }
}

function doClip(clipPaths, ctx) {
    for (var i = 0; i < clipPaths.length; i++) {
        var clipPath = clipPaths[i];                  // 一个clipPath相当于一个 形状，  比如圆形 ，正方形 。。。

        clipPath.setTransform(ctx);                  // 设置变换，和后面的恢复变换成一对，  每次绘制前先设置变换-----完成后再恢复变换。
        ctx.beginPath();                             // beginPath 是canvas 自带的api，就是告诉一下 我要开始绘制了
        clipPath.buildPath(ctx, clipPath.shape);    // 调用 buildPath函数  ，绘制路径。
        ctx.clip();                                // clip() 方法从原始画布中剪切任意形状和尺寸。  一旦剪切了某个区域，则所有之后的绘图都会被限制在被剪切的区域内（不能访问画布上的其他区域）。您也可以在使用 clip() 方法前通过使用 save() 方法对当前画布区域进行保存，行恢复（通过 restore() 方法）
        // Transform back                          为什么要调用  clip？ 为了组合图形？  比如先画个圆，再画一个正方形，那么成的形状就是交集。
        clipPath.restoreTransform(ctx);
    }
}

function createRoot(width, height) {
    var domRoot = document.createElement('div');

    // domRoot.onselectstart = returnFalse; // 避免页面选中的尴尬
    domRoot.style.cssText = [
        'position:relative',
        'overflow:hidden',
        'width:' + width + 'px',
        'height:' + height + 'px',
        'padding:0',
        'margin:0',
        'border-width:0'
    ].join(';') + ';';

    return domRoot;
}

/**
 * @alias module:zrender/Painter
 * @constructor
 * @param {HTMLElement} root 绘图容器
 * @param {module:zrender/Storage} storage
 * @param {Object} opts
 */
var Painter = function (root, storage, opts) {

    this.type = 'canvas';

    // In node environment using node-canvas
    var singleCanvas = !root.nodeName          // In node ?        // 根节点是canvas   那就是true，       如果 传入的是canvas元素，那就在一个canvas上绘图？    如果不是 可能是div  那就在div中创建一个cavans元素
        || root.nodeName.toUpperCase() === 'CANVAS';

    this._opts = opts = util.extend({}, opts || {});
    this.dpr = opts.devicePixelRatio || devicePixelRatio;        //   @type {number} 设备像素比
    this._singleCanvas = singleCanvas;                            //  @type {boolean}
    this.root = root;                                              //  @type {HTMLElement}  绘图容器可能是cavans元素，  也可能是div元素。
    var rootStyle = root.style;

    if (rootStyle) {
        rootStyle['-webkit-tap-highlight-color'] = 'transparent';
        rootStyle['-webkit-user-select'] =
        rootStyle['user-select'] =
        rootStyle['-webkit-touch-callout'] = 'none';

        root.innerHTML = '';                                //html元素 把里面的内容清空，并且文本不能被选择。  这个是不是针对SVG的？  不知道呀，canvas文字肯定不能选择。
    }

    // this._domRoot -----------------------------------这个是以后绘图的地方，判断this.root后，  返回的是canvas 空间， 或者是 div position:relative ,







    /**
     * @type {module:zrender/Storage}
     */
    this.storage = storage;

    /**
     * @type {Array.<number>}
     * @private
     */
    var zlevelList = this._zlevelList = [];           //层级列表  [0,1]  那么说明有两层        记录的 layers中每个key数组。

    /**
     * @type {Object.<string, module:zrender/Layer>}         //一个canvas 对应一层 layer，     一般情况下只会有一个canvas 也就是只有一个layer 默认0，  如果有hover hover会单独占据一层最大1000   ，
     * @private                                                                               其他的可以主动设置参数  zlevel:i,  来设置元素所在层级，  如果多了就会自动生成canvas。  如：test/hoverLayer.html
     */
    var layers = this._layers = {};                  // 如果是singleLayer的时候   只有一个层而且不是内建的，            从层级列表中获取值------可以当 layers的 key 来获取对应位置的  层layer         谁给_layers添加数据？ 绘图图形的是偶doPaint。。发现没有就会创建一个保存在这里，这里的创建都是内建的图层。

    /**
     * @type {Object.<string, Object>}
     * @type {private}
     */
    this._layerConfig = {};                         // 图层配置 修改的时候修改这里 ，然后再修改到对应的layer处

    if (!singleCanvas) {                                   // 如果不是canvas元素， 那就用 有可能是其他任何元素了，获取宽度，可能不一样。  专用方法去获取。
        this._width = this._getSize(0);
        this._height = this._getSize(1);

        var domRoot = this._domRoot = createRoot(
            this._width, this._height
        );
        root.appendChild(domRoot);                        // 如果不是canvas的话，  可能是div元素，   那就新建一个 canvas元素  ，宽度高度一样  positon:relative   overflow hidden  当做主背景。
    }
    else {                                                // 如果是canvas 元素，那就好说了， 获取宽度就一种。
        if (opts.width != null) {
            root.width = opts.width;
        }
        if (opts.height != null) {
            root.height = opts.height;
        }
        // Use canvas width and height directly
        var width = root.width;
        var height = root.height;
        this._width = width;                             // 把 容器元素的长宽   -----给Painter ，当做总的长宽。  当做以后绘图的环境。
        this._height = height;

        // Create layer if only one given canvas
        // Device pixel ratio is fixed to 1 because given canvas has its specified width and height   设备像素比固定为1，因为给定的画布有其指定的宽度和高度。
        var mainLayer = new Layer(root, this, 1);         // 在画布上 布上一层主  图层
        mainLayer.initContext();
        // FIXME Use canvas width and height
        // mainLayer.resize(width, height);
        layers[0] = mainLayer;                             // 把图层放入 图层数组里面
        zlevelList.push(0);                                // 图层的等级 放入到  zlevelList数组中，    z 是z轴方向上的，层叠上，   level水平，层级，      zlevelList代表的是总共有几个层级。   拿着某一个层级可以去layer中 找到对应的图层。

        this._domRoot = root;
    }

    // Layers for progressive rendering
    this._progressiveLayers = [];                    // 正在渲染的 图层数组吗？？    渐进渲染的图层？   为什么是渐进呢？

    /**
     * @type {module:zrender/Layer}
     * @private
     */
    this._hoverlayer;                           // 高亮层  -------------  下面的hoverElement 数组中的元素都是在这个图层上渲染的。

    this._hoverElements = [];                  // addHover addHover  clearHover  refreshHover 全部都是对这个数组的维护。  refreshHover 遍历一下  调用_doPaintEl渲染
                                                 // 里面放置得并不是  元素，  而是元素的一个镜像。 通过这个镜像 可以找到元素本身。
};

Painter.prototype = {

    constructor: Painter,



    getType: function () {
        return 'canvas';
    },

    /**
     * If painter use a single canvas
     * @return {boolean}
     */
    isSingleCanvas: function () {
        return this._singleCanvas;
    },
    /**
     * @return {HTMLDivElement}
     */
    getViewportRoot: function () {
        return this._domRoot;
    },

    getViewportRootOffset: function () {
        var viewportRoot = this.getViewportRoot();
        if (viewportRoot) {
            return {
                offsetLeft: viewportRoot.offsetLeft || 0,         // 相对于父元素的  top  或者 left距离，
                offsetTop: viewportRoot.offsetTop || 0
            };
        }
    },





    /**
     * 刷新
     * @param {boolean} [paintAll=false]   强制绘制所有displayable      把 storage仓库中的 单个图形 全部绘制一遍
     */
    refresh: function (paintAll) {                          // 每次刷新都要绘制3部分内容，   1，全部绘制一下。2. 刷新hover层。 3.  绘制渐进层

        var list = this.storage.getDisplayList(true);       // 从storage中  获取所有的要绘制的元素。

        var zlevelList = this._zlevelList;

        this._paintList(list, paintAll);                       //1，全部绘制一下。

        // Paint custum layers
        for (var i = 0; i < zlevelList.length; i++) {
            var z = zlevelList[i];
            var layer = this._layers[z];
            if (!layer.__builtin__ && layer.refresh) {        //不是内建的  图层  ，去刷新一下？  为什么？
                layer.refresh();
            }
        }

        this.refreshHover();                                  //2. 刷新hover层

        if (this._progressiveLayers.length) {
            this._startProgessive();                         //3.  绘制渐进层  （根据图层的渲染次数，  多次渲染。）
        }

        return this;
    },




    addHover: function (el, hoverStyle) {            // 里面放置得并不是  元素，  而是元素的一个镜像。 通过这个镜像 可以找到元素本身。         所以hover元素 也是一个元素。
        if (el.__hoverMir) {
            return;
        }
        var elMirror = new el.constructor({
            style: el.style,
            shape: el.shape
        });
        elMirror.__from = el;
        el.__hoverMir = elMirror;
        elMirror.setStyle(hoverStyle);
        this._hoverElements.push(elMirror);
    },

    removeHover: function (el) {
        var elMirror = el.__hoverMir;
        var hoverElements = this._hoverElements;
        var idx = util.indexOf(hoverElements, elMirror);
        if (idx >= 0) {
            hoverElements.splice(idx, 1);
        }
        el.__hoverMir = null;
    },

    clearHover: function (el) {
        var hoverElements = this._hoverElements;
        for (var i = 0; i < hoverElements.length; i++) {
            var from = hoverElements[i].__from;
            if (from) {
                from.__hoverMir = null;
            }
        }
        hoverElements.length = 0;
    },

    refreshHover: function () {
        var hoverElements = this._hoverElements;                //hover 专有一个图层_hoverlayer，    所有的元素 在 _hoverElements中
        var len = hoverElements.length;
        var hoverLayer = this._hoverlayer;
        hoverLayer && hoverLayer.clear();

        if (!len) {
            return;
        }
        timsort(hoverElements, this.storage.displayableSortFunc);      // 传入hoverElement数组 和排序函数  ----去排序一下。

        // Use a extream large zlevel                                   // 每个图层有个图层编号，0,1,2，，，，代表在绘图中的顺序 并且有个 zr_0的id。  这里用一个超大型zlevel图层编号100000   放置在最上层。
        // FIXME?
        if (!hoverLayer) {
            hoverLayer = this._hoverlayer = this.getLayer(1e5);
        }

        var scope = {};
        hoverLayer.ctx.save();
        for (var i = 0; i < len;) {
            var el = hoverElements[i];
            var originalEl = el.__from;       // 通过镜像的引用，找到真实的元素，
            // Original el is removed
            // PENDING
            if (!(originalEl && originalEl.__zr)) {
                hoverElements.splice(i, 1);
                originalEl.__hoverMir = null;
                len--;
                continue;
            }
            i++;

            // Use transform
            // FIXME style and shape ?
            if (!originalEl.invisible) {                          //这里为什么用  镜像元素，而不是用真实的元素呢？
                el.transform = originalEl.transform;
                el.invTransform = originalEl.invTransform;
                el.__clipPaths = originalEl.__clipPaths;
                // el.
                this._doPaintEl(el, hoverLayer, true, scope);    //绘制 所有的 hover 元素。
            }
        }
        hoverLayer.ctx.restore();
    },





    _startProgessive: function () {
        var self = this;

        if (!self._furtherProgressive) {                       // _paintList所有的元素之后会修改     _furtherProgressive  这个标志位，  判断要不要 进行_startProgessive  ，都绘制完了，这是要干嘛？
            return;
        }

        // Use a token to stop progress steps triggered by      用一个token  来记录状态， 保持一致刷新，   每次 _progress++ ， 当绘制完之后，更新_furtherProgressive状态，   不满足需求了 就更改token的值，从而停止循环。
        // previous zr.refresh calling.
        var token = self._progressiveToken = +new Date();

        self._progress++;                                      // painter绘制的次数。 记录总进度，  但是     最大进度是记录在图层上的  对比的也是 图层上的进度， 这个怎么进行的？
        requestAnimationFrame(step);

        function step() {
            // In case refreshed or disposed
            if (token === self._progressiveToken && self.storage) {

                self._doPaintList(self.storage.getDisplayList());              //从新从 storage中 获取list  这次没有传入 true  所以 displaylist没有更新直接拿回来，  和上次拿回来的一样。  相当于self._progress++; 之后   从新绘制了一遍

                if (self._furtherProgressive) {
                    self._progress++;
                    requestAnimationFrame(step);
                }
                else {
                    self._progressiveToken = -1;
                }
            }
        }
    },                // 开始进度， 开始进程，   绘画的开始，  像做动画一样，  定时器 一针一针的去渲染。   zrender 的 鼠标悬浮  不是用的css的hover  而是图层。

    _clearProgressive: function () {
        this._progressiveToken = -1;
        this._progress = 0;
        util.each(this._progressiveLayers, function (layer) {
            layer.__dirty && layer.clear();
        });
    },






    _paintList: function (list, paintAll) {           //绘制 整个列表

        if (paintAll == null) {
            paintAll = false;
        }

        this._updateLayerStatus(list);                // 更新层状态

        this._clearProgressive();                     // 该需要清空的图层 清空一下。

        this.eachBuiltinLayer(preProcessLayer);        // 前置  图层处理一下

        this._doPaintList(list, paintAll);             // 绘制图形

        this.eachBuiltinLayer(postProcessLayer);       // 后置  图层处理一下
    },

    _doPaintList: function (list, paintAll) {
        var currentLayer;                                        //当前图层
        var currentZLevel;                                       // 当前图层的id    ---- paintList  要去绘制可能 很多个Element， 可能是在同一层画布，也可能在不同的画布， 这里记录绘制过程的全局变量，
        var ctx;

        // var invTransform = [];
        var scope;                                               //作用域

        var progressiveLayerIdx = 0;                             // 当前正在进行的图层的id
        var currentProgressiveLayer;                             //  当前长在进行的图层            和上面的有什么区别呢？

        var width = this._width;
        var height = this._height;
        var layerProgress;
        var frame = this._progress;                            // 从这里获取 总的进度的。
        function flushProgressiveLayer(layer) {
            var dpr = ctx.dpr || 1;
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            // Avoid layer don't clear in next progressive frame
            currentLayer.__dirty = true;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(layer.dom, 0, 0, width * dpr, height * dpr);
            ctx.restore();
        }

        for (var i = 0, l = list.length; i < l; i++) {                  // 把storage中的 Sub形状遍历一下  var list = this.storage.getDisplayList(true);
            var el = list[i];
            var elZLevel = this._singleCanvas ? 0 : el.zlevel;       // 层级   如果根节点是canvas  那就0层，   否则为图形的层 （图形的层默认也为0）     这里只是提供一个 zindex 供我们分层使用

            var elFrame = el.__frame;                                  // 这里__frame  找不到源头， 默认 -1？  哪来的？

            // Flush at current context
            // PENDING
            if (elFrame < 0 && currentProgressiveLayer) {
                flushProgressiveLayer(currentProgressiveLayer);
                currentProgressiveLayer = null;
            }

            // Change draw layer                                         如果来的这个元素 的层级和当前画布上的层级不一样，  或则当前画布上还没有层级-------那就需要从层级中获取一个层 或者再创建一个。
            if (currentZLevel !== elZLevel) {
                if (ctx) {
                    ctx.restore();                                     // 如果是切换图层的话， 那就要把之前保存的状态去除掉。从新save。
                }

                // Reset scope
                scope = {};

                // Only 0 zlevel if only has one canvas                 把当前的图层  切换到需要绘制图形的图层。
                currentZLevel = elZLevel;
                currentLayer = this.getLayer(currentZLevel);

                if (!currentLayer.__builtin__) {
                    log(
                        'ZLevel ' + currentZLevel
                        + ' has been used by unkown layer ' + currentLayer.id
                    );
                }

                ctx = currentLayer.ctx;                                                 // 切换图层之后，  重置一下ctx   保存一下 默认状态。
                ctx.save();

                // Reset the count                   重置一下，计数用
                currentLayer.__unusedCount = 0;

                if (currentLayer.__dirty || paintAll) {
                    currentLayer.clear();
                }
            }

            if (!(currentLayer.__dirty || paintAll)) {
                continue;
            }

            if (elFrame >= 0) {
                // Progressive layer changed
                if (!currentProgressiveLayer) {
                    currentProgressiveLayer = this._progressiveLayers[
                        Math.min(progressiveLayerIdx++, MAX_PROGRESSIVE_LAYER_NUMBER - 1)
                    ];

                    currentProgressiveLayer.ctx.save();
                    currentProgressiveLayer.renderScope = {};

                    if (currentProgressiveLayer
                        && (currentProgressiveLayer.__progress > currentProgressiveLayer.__maxProgress)
                    ) {
                        // flushProgressiveLayer(currentProgressiveLayer);
                        // Quick jump all progressive elements
                        // All progressive element are not dirty, jump over and flush directly
                        i = currentProgressiveLayer.__nextIdxNotProg - 1;
                        // currentProgressiveLayer = null;
                        continue;
                    }

                    layerProgress = currentProgressiveLayer.__progress;

                    if (!currentProgressiveLayer.__dirty) {
                        // Keep rendering
                        frame = layerProgress;
                    }

                    currentProgressiveLayer.__progress = frame + 1;
                }

                if (elFrame === frame) {
                    this._doPaintEl(el, currentProgressiveLayer, true, currentProgressiveLayer.renderScope);
                }
            }
            else {
                this._doPaintEl(el, currentLayer, paintAll, scope);
            }

            el.__dirty = false;
        }

        if (currentProgressiveLayer) {
            flushProgressiveLayer(currentProgressiveLayer);
        }

        // Restore the lastLayer ctx                           绘制完所有的Element之后， 状态恢复默认值 ctx.restore();
        ctx && ctx.restore();
        // If still has clipping state
        // if (scope.prevElClipPaths) {
        //     ctx.restore();
        // }

        this._furtherProgressive = false;
        util.each(this._progressiveLayers, function (layer) {              // 每次渲染完所有的元素之后，  每个都要判断是不是还没到 最大帧。
            if (layer.__maxProgress >= layer.__progress) {                 // 每一帧是一个progress 如果layer.__progress  还小于  __maxProgress  ，那么还需要再来一次。
                this._furtherProgressive = true;                           // 如果有一个图层没到要求，就需要从新来一次。
            }
        }, this);
    },

    _doPaintEl: function (el, currentLayer, forcePaint, scope) {
        var ctx = currentLayer.ctx;
        var m = el.transform;
        if (
            (currentLayer.__dirty || forcePaint)
            // Ignore invisible element                                             //  忽视  invisible 不可见的元素
            && !el.invisible
            // Ignore transparent element
            && el.style.opacity !== 0                                                  //忽略 透明度为0的
            // Ignore scale 0 element, in some environment like node-canvas
            // Draw a scale 0 element can cause all following draw wrong
            // And setTransform with scale 0 will cause set back transform failed.
            && !(m && !m[0] && !m[3])                                                    // 忽视 通过变换  或则缩放  到 0的元素
            // Ignore culled element
            && !(el.culling && isDisplayableCulled(el, this._width, this._height))   //   忽视掉   超出了可视区域。
        ) {

            var clipPaths = el.__clipPaths;                                       // 在storage 中已经把 Element 有层级关系的clipPath 的 全部放到 相关的el上面。

            // Optimize when clipping on group with several elements
            if (scope.prevClipLayer !== currentLayer
                || isClipPathChanged(clipPaths, scope.prevElClipPaths)
            ) {
                // If has previous clipping state, restore from it
                if (scope.prevElClipPaths) {                                  // scope 保存的是之前的 clipLayer， 之前的El，之前的clipPaths
                    scope.prevClipLayer.ctx.restore();                       // 如果有 clip了  那么恢复一下  和下面的save对应。
                    scope.prevClipLayer = scope.prevElClipPaths = null;

                    // Reset prevEl since context has been restored
                    scope.prevEl = null;
                }
                // New clipping state
                if (clipPaths) {
                    ctx.save();                                         //先保存一下绘图空间主要针对 clip的， 等会再到恢复到之前额区域
                    doClip(clipPaths, ctx);                              // clip  设置剪切的区域， clip可以连续调用取合集
                    scope.prevClipLayer = currentLayer;
                    scope.prevElClipPaths = clipPaths;
                }
            }
            el.beforeBrush && el.beforeBrush(ctx);

            el.brush(ctx, scope.prevEl || null);                               // 这里面是 绘制形状 并上色 fill 或者 stroke           那前面的doClip  算什么？  为这里框定一个范围？ 对的就是这样的。
            scope.prevEl = el;

            el.afterBrush && el.afterBrush(ctx);
        }
    },















    /**
     * 获取 zlevel 所在层，如果不存在则会创建一个新的层         与图层有关的函数       ，这些函数操作的仅仅是 layers zlevelList   这些对象 数组，  渲染是其他的事情。
     * @param {number} zlevel
     * @return {module:zrender/Layer}
     */
    getLayer: function (zlevel) {
        if (this._singleCanvas) {
            return this._layers[0];
        }

        var layer = this._layers[zlevel];
        if (!layer) {
            // Create a new layer                                             //  通过绘制 的时候去创建的图层 都是内建的图层，   HTML中的canvas 图层不是内建的。
            layer = new Layer('zr_' + zlevel, this, this.dpr);
            layer.__builtin__ = true;

            if (this._layerConfig[zlevel]) {
                util.merge(layer, this._layerConfig[zlevel], true);
            }

            this.insertLayer(zlevel, layer);

            // Context is created after dom inserted to document
            // Or excanvas will get 0px clientWidth and clientHeight
            layer.initContext();
        }

        return layer;
    },

    insertLayer: function (zlevel, layer) {

        var layersMap = this._layers;
        var zlevelList = this._zlevelList;
        var len = zlevelList.length;
        var prevLayer = null;
        var i = -1;
        var domRoot = this._domRoot;

        if (layersMap[zlevel]) {
            log('ZLevel ' + zlevel + ' has been used already');
            return;
        }
        // Check if is a valid layer
        if (!isLayerValid(layer)) {
            log('Layer of zlevel ' + zlevel + ' is not valid');
            return;
        }

        if (len > 0 && zlevel > zlevelList[0]) {
            for (i = 0; i < len - 1; i++) {
                if (
                    zlevelList[i] < zlevel
                    && zlevelList[i + 1] > zlevel
                ) {
                    break;
                }
            }
            prevLayer = layersMap[zlevelList[i]];      // 上一个层。
        }
        zlevelList.splice(i + 1, 0, zlevel);           // 按顺序 插入到 响应的位置。

        layersMap[zlevel] = layer;

        // Vitual layer will not directly show on the screen.
        // (It can be a WebGL layer and assigned to a ZImage element)
        // But it still under management of zrender.
        if (!layer.virtual) {
            if (prevLayer) {
                var prevDom = prevLayer.dom;
                if (prevDom.nextSibling) {
                    domRoot.insertBefore(
                        layer.dom,
                        prevDom.nextSibling
                    );
                }
                else {
                    domRoot.appendChild(layer.dom);
                }
            }
            else {
                if (domRoot.firstChild) {
                    domRoot.insertBefore(layer.dom, domRoot.firstChild);
                }
                else {
                    domRoot.appendChild(layer.dom);
                }
            }
        }
    },

    // Iterate each layer
    eachLayer: function (cb, context) {
        var zlevelList = this._zlevelList;
        var z;
        var i;
        for (i = 0; i < zlevelList.length; i++) {
            z = zlevelList[i];
            cb.call(context, this._layers[z], z);
        }
    },

    // Iterate each buildin layer                              图层 也分为 内建 和外来的，  内建的图层有一个属性__builtin__为true
    eachBuiltinLayer: function (cb, context) {                // 传入一个函数， 然后一个一个把内建layer传进去， 让函数操作一下。
        var zlevelList = this._zlevelList;
        var layer;
        var z;
        var i;
        for (i = 0; i < zlevelList.length; i++) {
            z = zlevelList[i];
            layer = this._layers[z];
            if (layer.__builtin__) {
                cb.call(context, layer, z);
            }
        }
    },

    // Iterate each other layer except buildin layer
    eachOtherLayer: function (cb, context) {
        var zlevelList = this._zlevelList;
        var layer;
        var z;
        var i;
        for (i = 0; i < zlevelList.length; i++) {
            z = zlevelList[i];
            layer = this._layers[z];
            if (!layer.__builtin__) {
                cb.call(context, layer, z);
            }
        }
    },

    /**
     * 获取所有已创建的层
     * @param {Array.<module:zrender/Layer>} [prevLayer]
     */
    getLayers: function () {
        return this._layers;
    },

    _updateLayerStatus: function (list) {

        var layers = this._layers;
        var progressiveLayers = this._progressiveLayers;

        var elCountsLastFrame = {};                          //  最后一帧            各个图层上 对应的元素的数量
        var progressiveElCountsLastFrame = {};               //  最后一帧，正在进行的 各个图层上  对应的元素的数量

        this.eachBuiltinLayer(function (layer, z) {
            elCountsLastFrame[z] = layer.elCount;
            layer.elCount = 0;                               //清空之前图层元素的计数。
            layer.__dirty = false;
        });
        util.each(progressiveLayers, function (layer, idx) {
            progressiveElCountsLastFrame[idx] = layer.elCount;
            layer.elCount = 0;
            layer.__dirty = false;
        });


        var progressiveLayerCount = 0;
        var currentProgressiveLayer;
        var lastProgressiveKey;
        var frameCount = 0;
        for (var i = 0, l = list.length; i < l; i++) {                 //遍历所有要 绘制的元素
            var el = list[i];
            var zlevel = this._singleCanvas ? 0 : el.zlevel;
            var layer = layers[zlevel];
            var elProgress = el.progressive;                           // 元素的displayable属性   ，当 >0  逐步渲染元素
            if (layer) {                                                 // 遍历所有的要绘制的图形，    对应的图层上计数，  如果一个元素脏了，那么整个图层也是脏了
                layer.elCount++;
                layer.__dirty = layer.__dirty || el.__dirty;
            }

            /////// Update progressive                                   //   如果 元素的本身是渐进的， 那就找对应的   ---放到progressiveLayers中的图层，  如果没有创建一个。   这里就是创建并维护渐进图层。
            if (elProgress >= 0) {
                // Fix wrong progressive sequence problem.                修正错误渐进序列问题。
                if (lastProgressiveKey !== elProgress) {
                    lastProgressiveKey = elProgress;
                    frameCount++;
                }
                var elFrame = el.__frame = frameCount - 1;
                if (!currentProgressiveLayer) {                                                           //  如果当前的  渐进图层不存在 那就创建一个 并放入       progressiveLayers中。
                    var idx = Math.min(progressiveLayerCount, MAX_PROGRESSIVE_LAYER_NUMBER - 1);
                    currentProgressiveLayer = progressiveLayers[idx];
                    if (!currentProgressiveLayer) {
                        currentProgressiveLayer = progressiveLayers[idx] = new Layer(
                            'progressive', this, this.dpr
                        );
                        currentProgressiveLayer.initContext();
                    }
                    currentProgressiveLayer.__maxProgress = 0;
                }                      //  如果当前的  渐进图层不存在 那就创建一个 并放入       progressiveLayers中。
                currentProgressiveLayer.__dirty = currentProgressiveLayer.__dirty || el.__dirty;
                currentProgressiveLayer.elCount++;

                currentProgressiveLayer.__maxProgress = Math.max(
                    currentProgressiveLayer.__maxProgress, elFrame
                );

                if (currentProgressiveLayer.__maxProgress >= currentProgressiveLayer.__progress) {
                    // Should keep rendering this  layer because progressive rendering is not finished yet
                    layer.__dirty = true;
                }
            }
            else {
                el.__frame = -1;

                if (currentProgressiveLayer) {
                    currentProgressiveLayer.__nextIdxNotProg = i;
                    progressiveLayerCount++;
                    currentProgressiveLayer = null;
                }
            }
        }

        if (currentProgressiveLayer) {
            progressiveLayerCount++;
            currentProgressiveLayer.__nextIdxNotProg = i;
        }

        // 层中的元素数量有发生变化
        this.eachBuiltinLayer(function (layer, z) {
            if (elCountsLastFrame[z] !== layer.elCount) {
                layer.__dirty = true;
            }
        });

        progressiveLayers.length = Math.min(progressiveLayerCount, MAX_PROGRESSIVE_LAYER_NUMBER);
        util.each(progressiveLayers, function (layer, idx) {
            if (progressiveElCountsLastFrame[idx] !== layer.elCount) {
                el.__dirty = true;
            }
            if (layer.__dirty) {
                layer.__progress = 0;
            }
        });
    },

    /**
     * 清除hover层外所有内容
     */
    clear: function () {
        this.eachBuiltinLayer(this._clearLayer);
        return this;
    },

    _clearLayer: function (layer) {
        layer.clear();
    },

    /**
     * 修改指定zlevel的绘制参数
     *
     * @param {string} zlevel
     * @param {Object} config 配置对象
     * @param {string} [config.clearColor=0] 每次清空画布的颜色
     * @param {string} [config.motionBlur=false] 是否开启动态模糊
     * @param {number} [config.lastFrameAlpha=0.7]
     *                 在开启动态模糊的时候使用，与上一帧混合的alpha值，值越大尾迹越明显
     */
    configLayer: function (zlevel, config) {
        if (config) {
            var layerConfig = this._layerConfig;
            if (!layerConfig[zlevel]) {
                layerConfig[zlevel] = config;
            }
            else {
                util.merge(layerConfig[zlevel], config, true);
            }

            var layer = this._layers[zlevel];

            if (layer) {
                util.merge(layer, layerConfig[zlevel], true);
            }
        }
    },

    /**
     * 删除指定层
     * @param {number} zlevel 层所在的zlevel
     */
    delLayer: function (zlevel) {
        var layers = this._layers;
        var zlevelList = this._zlevelList;
        var layer = layers[zlevel];
        if (!layer) {
            return;
        }
        layer.dom.parentNode.removeChild(layer.dom);
        delete layers[zlevel];

        zlevelList.splice(util.indexOf(zlevelList, zlevel), 1);
    },














    /**
     * 区域大小变化后重绘
     */
    resize: function (width, height) {
        var domRoot = this._domRoot;
        // FIXME Why ?
        domRoot.style.display = 'none';

        // Save input w/h
        var opts = this._opts;
        width != null && (opts.width = width);
        height != null && (opts.height = height);

        width = this._getSize(0);
        height = this._getSize(1);

        domRoot.style.display = '';

        // 优化没有实际改变的resize
        if (this._width != width || height != this._height) {
            domRoot.style.width = width + 'px';
            domRoot.style.height = height + 'px';

            for (var id in this._layers) {
                if (this._layers.hasOwnProperty(id)) {
                    this._layers[id].resize(width, height);
                }
            }
            util.each(this._progressiveLayers, function (layer) {
                layer.resize(width, height);
            });

            this.refresh(true);
        }

        this._width = width;
        this._height = height;

        return this;
    },

    /**
     * 清除单独的一个层
     * @param {number} zlevel
     */
    clearLayer: function (zlevel) {
        var layer = this._layers[zlevel];
        if (layer) {
            layer.clear();
        }
    },

    /**
     * 释放
     */
    dispose: function () {
        this.root.innerHTML = '';

        this.root =
        this.storage =

        this._domRoot =
        this._layers = null;
    },

    /**
     * Get canvas which has all thing rendered
     * @param {Object} opts
     * @param {string} [opts.backgroundColor]
     * @param {number} [opts.pixelRatio]
     */
    getRenderedCanvas: function (opts) {
        opts = opts || {};
        if (this._singleCanvas) {
            return this._layers[0].dom;
        }

        var imageLayer = new Layer('image', this, opts.pixelRatio || this.dpr);
        imageLayer.initContext();

        imageLayer.clearColor = opts.backgroundColor;
        imageLayer.clear();

        var displayList = this.storage.getDisplayList(true);

        var scope = {};
        var zlevel;

        var self = this;
        function findAndDrawOtherLayer(smaller, larger) {
            var zlevelList = self._zlevelList;
            if (smaller == null) {
                smaller = -Infinity;
            }
            var intermediateLayer;
            for (var i = 0; i < zlevelList.length; i++) {
                var z = zlevelList[i];
                var layer = self._layers[z];
                if (!layer.__builtin__ && z > smaller && z < larger) {
                    intermediateLayer = layer;
                    break;
                }
            }
            if (intermediateLayer && intermediateLayer.renderToCanvas) {
                imageLayer.ctx.save();
                intermediateLayer.renderToCanvas(imageLayer.ctx);
                imageLayer.ctx.restore();
            }
        }
        for (var i = 0; i < displayList.length; i++) {
            var el = displayList[i];

            if (el.zlevel !== zlevel) {
                findAndDrawOtherLayer(zlevel, el.zlevel);
                zlevel = el.zlevel;
            }
            this._doPaintEl(el, imageLayer, true, scope);
        }

        findAndDrawOtherLayer(zlevel, Infinity);

        return imageLayer.dom;
    },
    /**
     * 获取绘图区域宽度
     */
    getWidth: function () {
        return this._width;
    },

    /**
     * 获取绘图区域高度
     */
    getHeight: function () {
        return this._height;
    },

    _getSize: function (whIdx) {
        var opts = this._opts;
        var wh = ['width', 'height'][whIdx];
        var cwh = ['clientWidth', 'clientHeight'][whIdx];
        var plt = ['paddingLeft', 'paddingTop'][whIdx];
        var prb = ['paddingRight', 'paddingBottom'][whIdx];

        if (opts[wh] != null && opts[wh] !== 'auto') {
            return parseFloat(opts[wh]);
        }

        var root = this.root;
        // IE8 does not support getComputedStyle, but it use VML.
        var stl = document.defaultView.getComputedStyle(root);

        return (
            (root[cwh] || parseInt10(stl[wh]) || parseInt10(root.style[wh]))
            - (parseInt10(stl[plt]) || 0)
            - (parseInt10(stl[prb]) || 0)
        ) | 0;
    },

    pathToImage: function (path, dpr) {
        dpr = dpr || this.dpr;

        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        var rect = path.getBoundingRect();
        var style = path.style;
        var shadowBlurSize = style.shadowBlur;
        var shadowOffsetX = style.shadowOffsetX;
        var shadowOffsetY = style.shadowOffsetY;
        var lineWidth = style.hasStroke() ? style.lineWidth : 0;

        var leftMargin = Math.max(lineWidth / 2, -shadowOffsetX + shadowBlurSize);
        var rightMargin = Math.max(lineWidth / 2, shadowOffsetX + shadowBlurSize);
        var topMargin = Math.max(lineWidth / 2, -shadowOffsetY + shadowBlurSize);
        var bottomMargin = Math.max(lineWidth / 2, shadowOffsetY + shadowBlurSize);
        var width = rect.width + leftMargin + rightMargin;
        var height = rect.height + topMargin + bottomMargin;

        canvas.width = width * dpr;
        canvas.height = height * dpr;

        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);
        ctx.dpr = dpr;

        var pathTransform = {
            position: path.position,
            rotation: path.rotation,
            scale: path.scale
        };
        path.position = [leftMargin - rect.x, topMargin - rect.y];
        path.rotation = 0;
        path.scale = [1, 1];
        path.updateTransform();
        if (path) {
            path.brush(ctx);
        }

        var ImageShape = Image;
        var imgShape = new ImageShape({
            style: {
                x: 0,
                y: 0,
                image: canvas
            }
        });

        if (pathTransform.position != null) {
            imgShape.position = path.position = pathTransform.position;
        }

        if (pathTransform.rotation != null) {
            imgShape.rotation = path.rotation = pathTransform.rotation;
        }

        if (pathTransform.scale != null) {
            imgShape.scale = path.scale = pathTransform.scale;
        }

        return imgShape;
    }
};

export default Painter;