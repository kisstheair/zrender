import Displayable from './Displayable';
import * as zrUtil from '../core/util';
import PathProxy from '../core/PathProxy';
import * as pathContain from '../contain/path';
import Pattern from './Pattern';

var getCanvasPattern = Pattern.prototype.getCanvasPattern;

var abs = Math.abs;

var pathProxyForDraw = new PathProxy(true);
/**
 * @alias module:zrender/graphic/Path
 * @extends module:zrender/graphic/Displayable
 * @constructor
 * @param {Object} opts
 */
function Path(opts) {
    Displayable.call(this, opts);

    /**
     * @type {module:zrender/core/PathProxy}
     * @readOnly
     */
    this.path = null;
}

Path.prototype = {

    constructor: Path,

    type: 'path',

    __dirtyPath: true,

    strokeContainThreshold: 5,

    brush: function (ctx, prevEl) {                                //  绘制图形  这里分了2部分，  一部分绘制形状， 一部分刷上颜色。  这里是刷颜色
        var style = this.style;
        var path = this.path || pathProxyForDraw;              //为什么使用代理？为了保存命令， 在vanvas上面套一层。
        var hasStroke = style.hasStroke();
        var hasFill = style.hasFill();
        var fill = style.fill;
        var stroke = style.stroke;
        var hasFillGradient = hasFill && !!(fill.colorStops);           // 是否具有渐变填充
        var hasStrokeGradient = hasStroke && !!(stroke.colorStops);     // 是否具有渐变绘制线
        var hasFillPattern = hasFill && !!(fill.image);                  // 是否  有填充图案
        var hasStrokePattern = hasStroke && !!(stroke.image);            // 是否具有 图案 绘制线

        style.bind(ctx, this, prevEl);                                 //设置canvas的全局变量
        this.setTransform(ctx);                                         //  这里开始设置变换  和下面的 重置变换 restoreTransform是一对，    中间是绘图 和填充的过程

        if (this.__dirty) {
            var rect;
            // Update gradient because bounding rect may changed
            if (hasFillGradient) {
                rect = rect || this.getBoundingRect();
                this._fillGradient = style.getGradient(ctx, fill, rect);
            }
            if (hasStrokeGradient) {
                rect = rect || this.getBoundingRect();
                this._strokeGradient = style.getGradient(ctx, stroke, rect);
            }
        }
        // Use the gradient or pattern
        if (hasFillGradient) {
            // PENDING If may have affect the state
            ctx.fillStyle = this._fillGradient;
        }
        else if (hasFillPattern) {
            ctx.fillStyle = getCanvasPattern.call(fill, ctx);
        }
        if (hasStrokeGradient) {
            ctx.strokeStyle = this._strokeGradient;
        }
        else if (hasStrokePattern) {
            ctx.strokeStyle = getCanvasPattern.call(stroke, ctx);
        }

        var lineDash = style.lineDash;
        var lineDashOffset = style.lineDashOffset;

        var ctxLineDash = !!ctx.setLineDash;

        // Update path sx, sy
        var scale = this.getGlobalScale();
        path.setScale(scale[0], scale[1]);

        // Proxy context
        // Rebuild path in following 2 cases
        // 1. Path is dirty
        // 2. Path needs javascript implemented lineDash stroking.
        //    In this case, lineDash information will not be saved in PathProxy
        if (this.__dirtyPath
            || (lineDash && !ctxLineDash && hasStroke)
        ) {
            path.beginPath(ctx);

            // Setting line dash before build path
            if (lineDash && !ctxLineDash) {
                path.setLineDash(lineDash);
                path.setLineDashOffset(lineDashOffset);
            }

            this.buildPath(path, this.shape, false);

            // Clear path dirty flag
            if (this.path) {
                this.__dirtyPath = false;
            }
        }
        else {
            // Replay path building
            ctx.beginPath();
            this.path.rebuildPath(ctx);
        }

        hasFill && path.fill(ctx);

        if (lineDash && ctxLineDash) {
            ctx.setLineDash(lineDash);
            ctx.lineDashOffset = lineDashOffset;
        }

        hasStroke && path.stroke(ctx);

        if (lineDash && ctxLineDash) {
            // PENDING
            // Remove lineDash
            ctx.setLineDash([]);
        }

        this.restoreTransform(ctx);

        // Draw rect text
        if (style.text != null) {
            this.drawRectText(ctx, this.getBoundingRect());
        }
    },

    // When bundling path, some shape may decide if use moveTo to begin a new subpath or closePath
    // Like in circle
    buildPath: function (ctx, shapeCfg, inBundle) {},

    createPathProxy: function () {
        this.path = new PathProxy();
    },

    getBoundingRect: function () {          //获取矩形边界
        var rect = this._rect;
        var style = this.style;
        var needsUpdateRect = !rect;
        if (needsUpdateRect) {
            var path = this.path;
            if (!path) {
                // Create path on demand.
                path = this.path = new PathProxy();
            }
            if (this.__dirtyPath) {
                path.beginPath();
                this.buildPath(path, this.shape, false);
            }
            rect = path.getBoundingRect();
        }
        this._rect = rect;

        if (style.hasStroke()) {
            // Needs update rect with stroke lineWidth when
            // 1. Element changes scale or lineWidth
            // 2. Shape is changed
            var rectWithStroke = this._rectWithStroke || (this._rectWithStroke = rect.clone());
            if (this.__dirty || needsUpdateRect) {
                rectWithStroke.copy(rect);
                // FIXME Must after updateTransform
                var w = style.lineWidth;
                // PENDING, Min line width is needed when line is horizontal or vertical
                var lineScale = style.strokeNoScale ? this.getLineScale() : 1;

                // Only add extra hover lineWidth when there are no fill
                if (!style.hasFill()) {
                    w = Math.max(w, this.strokeContainThreshold || 4);
                }
                // Consider line width
                // Line scale can't be 0;
                if (lineScale > 1e-10) {
                    rectWithStroke.width += w / lineScale;
                    rectWithStroke.height += w / lineScale;
                    rectWithStroke.x -= w / lineScale / 2;
                    rectWithStroke.y -= w / lineScale / 2;
                }
            }

            // Return rect with stroke
            return rectWithStroke;
        }

        return rect;
    },

    contain: function (x, y) {
        var localPos = this.transformCoordToLocal(x, y);
        var rect = this.getBoundingRect();
        var style = this.style;
        x = localPos[0];
        y = localPos[1];

        if (rect.contain(x, y)) {
            var pathData = this.path.data;
            if (style.hasStroke()) {
                var lineWidth = style.lineWidth;
                var lineScale = style.strokeNoScale ? this.getLineScale() : 1;
                // Line scale can't be 0;
                if (lineScale > 1e-10) {
                    // Only add extra hover lineWidth when there are no fill
                    if (!style.hasFill()) {
                        lineWidth = Math.max(lineWidth, this.strokeContainThreshold);
                    }
                    if (pathContain.containStroke(
                        pathData, lineWidth / lineScale, x, y
                    )) {
                        return true;
                    }
                }
            }
            if (style.hasFill()) {
                return pathContain.contain(pathData, x, y);
            }
        }
        return false;
    },

    /**
     * @param  {boolean} dirtyPath
     */
    dirty: function (dirtyPath) {
        if (dirtyPath == null) {
            dirtyPath = true;
        }
        // Only mark dirty, not mark clean
        if (dirtyPath) {
            this.__dirtyPath = dirtyPath;
            this._rect = null;
        }

        this.__dirty = true;

        this.__zr && this.__zr.refresh();

        // Used as a clipping path
        if (this.__clipTarget) {
            this.__clipTarget.dirty();
        }
    },

    /**
     * Alias for animate('shape')
     * @param {boolean} loop
     */
    animateShape: function (loop) {
        return this.animate('shape', loop);
    },

    // Overwrite attrKV
    attrKV: function (key, value) {
        // FIXME
        if (key === 'shape') {
            this.setShape(value);
            this.__dirtyPath = true;
            this._rect = null;
        }
        else {
            Displayable.prototype.attrKV.call(this, key, value);
        }
    },

    /**
     * @param {Object|string} key
     * @param {*} value
     */
    setShape: function (key, value) {
        var shape = this.shape;
        // Path from string may not have shape
        if (shape) {
            if (zrUtil.isObject(key)) {
                for (var name in key) {
                    if (key.hasOwnProperty(name)) {
                        shape[name] = key[name];
                    }
                }
            }
            else {
                shape[key] = value;
            }
            this.dirty(true);
        }
        return this;
    },

    getLineScale: function () {
        var m = this.transform;
        // Get the line scale.
        // Determinant of `m` means how much the area is enlarged by the
        // transformation. So its square root can be used as a scale factor
        // for width.
        return m && abs(m[0] - 1) > 1e-10 && abs(m[3] - 1) > 1e-10
            ? Math.sqrt(abs(m[0] * m[3] - m[2] * m[1]))
            : 1;
    }
};

/**
 * 扩展一个 Path element, 比如星形，圆等。
 * Extend a path element
 * @param {Object} props
 * @param {string} props.type Path type
 * @param {Function} props.init Initialize
 * @param {Function} props.buildPath Overwrite buildPath method
 * @param {Object} [props.style] Extended default style config
 * @param {Object} [props.shape] Extended default shape config
 */
Path.extend = function (defaults) {
    var Sub = function (opts) {
        Path.call(this, opts);

        if (defaults.style) {
            // Extend default style
            this.style.extendFrom(defaults.style, false);
        }

        // Extend default shape    继承默认的形状（如果没有给，那就用原来默认的。）
        var defaultShape = defaults.shape;
        if (defaultShape) {
            this.shape = this.shape || {};
            var thisShape = this.shape;
            for (var name in defaultShape) {
                if (
                    ! thisShape.hasOwnProperty(name)
                    && defaultShape.hasOwnProperty(name)
                ) {
                    thisShape[name] = defaultShape[name];
                }
            }
        }

        defaults.init && defaults.init.call(this, opts);
    };

    zrUtil.inherits(Sub, Path);

    // FIXME 不能 extend position, rotation 等引用对象
    for (var name in defaults) {
        // Extending prototype values and methods
        if (name !== 'style' && name !== 'shape') {
            Sub.prototype[name] = defaults[name];
        }
    }

    return Sub;
};

zrUtil.inherits(Path, Displayable);

export default Path;