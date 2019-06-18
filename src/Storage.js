/**
 * Storage内容仓库模块
 * @module zrender/Storage
 * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
 * @author errorrik (errorrik@gmail.com)
 * @author pissang (https://github.com/pissang/)
 */

import * as util from './core/util';
import env from './core/env';
import Group from './container/Group';

// Use timsort because in most case elements are partially sorted
// https://jsfiddle.net/pissang/jr4x7mdm/8/
import timsort from './core/timsort';

function shapeCompareFunc(a, b) {
    if (a.zlevel === b.zlevel) {
        if (a.z === b.z) {
            // if (a.z2 === b.z2) {
            //     // FIXME Slow has renderidx compare
            //     // http://stackoverflow.com/questions/20883421/sorting-in-javascript-should-every-compare-function-have-a-return-0-statement
            //     // https://github.com/v8/v8/blob/47cce544a31ed5577ffe2963f67acb4144ee0232/src/js/array.js#L1012
            //     return a.__renderidx - b.__renderidx;
            // }
            return a.z2 - b.z2;
        }
        return a.z - b.z;
    }
    return a.zlevel - b.zlevel;
}
/**
 * 内容仓库 (M)
 * @alias module:zrender/Storage
 * @constructor
 */
var Storage = function () { // jshint ignore:line
    this._roots = [];         //，将元素存储在this._roots（数组）和this._displayList（数组）中，然后负责在其中进行增（addRoot，addToMap）删(delRoot,delFromMap)改（updateDisplayList）查（get，getDisplayList）

    this._displayList = [];   // 两个数组一样？？    那为什么用2个呢？    _roots是供外部使用的，进行增删改，     _displayList是每次内部更新一下，重新排序roots之后放入进去的， 供绘制用的。

    this._displayListLen = 0;
};

Storage.prototype = {

    constructor: Storage,

    /**
     * @param  {Function} cb
     *  穿过;横贯，横切;横木;[建]横梁
     */
    traverse: function (cb, context) {
        for (var i = 0; i < this._roots.length; i++) {
            this._roots[i].traverse(cb, context);
        }
    },

    /**
     * 返回所有图形的绘制队列
     * @param {boolean} [update=false] 是否在返回前更新该数组
     * @param {boolean} [includeIgnore=false] 是否包含 ignore 的数组, 在 update 为 true 的时候有效
     *
     * 详见{@link module:zrender/graphic/Displayable.prototype.updateDisplayList}
     * @return {Array.<module:zrender/graphic/Displayable>}
     */
    getDisplayList: function (update, includeIgnore) {
        includeIgnore = includeIgnore || false;
        if (update) {
            this.updateDisplayList(includeIgnore);
        }
        return this._displayList;
    },








    /**
     * 更新图形的绘制队列。                                                                                       外部插入roots 之后，  更新一下绘图队列  ----排序之后放入_displayList
     * 每次绘制前都会调用，该方法会先深度优先遍历整个树，更新所有Group和Shape的变换并且把所有可见的Shape保存到数组中，
     * 最后根据绘制的优先级（zlevel > z > 插入顺序）排序得到绘制队列
     * @param {boolean} [includeIgnore=false] 是否包含 ignore 的数组
     */
    updateDisplayList: function (includeIgnore) {
        this._displayListLen = 0;
        var roots = this._roots;
        var displayList = this._displayList;
        for (var i = 0, len = roots.length; i < len; i++) {
            this._updateAndAddDisplayable(roots[i], null, includeIgnore);
        }
        displayList.length = this._displayListLen;

        // for (var i = 0, len = displayList.length; i < len; i++) {
        //     displayList[i].__renderidx = i;
        // }

        // displayList.sort(shapeCompareFunc);
        env.canvasSupported && timsort(displayList, shapeCompareFunc);
    },                              // roots  和 _displayList 两个数组 是存储元素的地方，  roots 是供外部调用的，  _displayList 是内部使用的。

    _updateAndAddDisplayable: function (el, clipPaths, includeIgnore) {           // 添加可以绘制的形状     添加到数组__clipPaths

        if (el.ignore && !includeIgnore) {
            return;
        }

        el.beforeUpdate();         // 钩子函数，               我们只更新Element的状态就行了，  animate会绘制它

        if (el.__dirty) {

            el.update();

        }

        el.afterUpdate();

        var userSetClipPath = el.clipPath;
        if (userSetClipPath) {

            // FIXME 效率影响
            if (clipPaths) {
                clipPaths = clipPaths.slice();
            }
            else {
                clipPaths = [];
            }

            var currentClipPath = userSetClipPath;
            var parentClipPath = el;
            // Recursively add clip path
            while (currentClipPath) {
                // clipPath 的变换是基于使用这个 clipPath 的元素
                currentClipPath.parent = parentClipPath;
                currentClipPath.updateTransform();

                clipPaths.push(currentClipPath);

                parentClipPath = currentClipPath;                 //-----------------------向上找  一直找剪切元素， 都放到这个数组里面  clipPaths
                currentClipPath = currentClipPath.clipPath;
            }
        }

        if (el.isGroup) {                                      // group 是没有剪切路径的
            var children = el._children;

            for (var i = 0; i < children.length; i++) {
                var child = children[i];

                // Force to mark as dirty if group is dirty
                // FIXME __dirtyPath ?
                if (el.__dirty) {
                    child.__dirty = true;
                }

                this._updateAndAddDisplayable(child, clipPaths, includeIgnore);
            }

            // Mark group clean here
            el.__dirty = false;

        }
        else {
            el.__clipPaths = clipPaths;                        // 只有元素有 剪切路径

            this._displayList[this._displayListLen++] = el;
        }
    },













    /**
     * 添加图形(Shape)或者组(Group)到根节点                 外部对roots进行维护  ，不会过滤重复的元素。
     * @param {module:zrender/Element} el          // addRoot        有添加元素的动作，同时调用addToStorage，并告诉需要更新了。
	 *                                             //addToStorage     让storage知道，有元素进来了需要更新了，  并没有添加的动作        这个是主要针对Group元素的，  group本身会添加到root，  group的子元素不会添加到root
	 *                                             //
	 * 
     */
    addRoot: function (el) {
        if (el.__storage === this) {
            return;
        }

        if (el instanceof Group) {
            el.addChildrenToStorage(this);
        }

        this.addToStorage(el);
        this._roots.push(el);
    },

    /**
     * 删除指定的图形(Shape)或者组(Group)
     * @param {string|Array.<string>} [el] 如果为空清空整个Storage
     *
     */
    delRoot: function (el) {
        if (el == null) {
            // 不指定el清空
            for (var i = 0; i < this._roots.length; i++) {
                var root = this._roots[i];
                if (root instanceof Group) {
                    root.delChildrenFromStorage(this);
                }
            }

            this._roots = [];
            this._displayList = [];
            this._displayListLen = 0;

            return;
        }

        if (el instanceof Array) {
            for (var i = 0, l = el.length; i < l; i++) {
                this.delRoot(el[i]);
            }
            return;
        }


        var idx = util.indexOf(this._roots, el);
        if (idx >= 0) {
            this.delFromStorage(el);
            this._roots.splice(idx, 1);
            if (el instanceof Group) {
                el.delChildrenFromStorage(this);
            }
        }
    },                     //  清空 roots  清空 displayList ， 并且清除引用。

    addToStorage: function (el) {
        el.__storage = this;
        el.dirty(false);

        return this;
    },                // 这里不能说是添加到Storage了，因为addRoot已经添加到roots中了，这里只是给元素添加 __storage 属性 指向所属的Storage

    delFromStorage: function (el) {
        if (el) {
            el.__storage = null;
        }

        return this;
    },

    /**
     * 清空并且释放Storage
     */
    dispose: function () {
        this._renderList =
        this._roots = null;
    },














    displayableSortFunc: shapeCompareFunc     // 排序函数 大于 等于，小于   返回正数，  0   ， 负数
};

export default Storage;