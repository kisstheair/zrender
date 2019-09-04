/**
 * 事件扩展
 * @module zrender/mixin/Eventful
 * @author Kener (@Kener-林峰, kener.linfeng@gmail.com)
 *         pissang (https://www.github.com/pissang)
 */

var arrySlice = Array.prototype.slice;

/**
 * 事件分发器
 * @alias module:zrender/mixin/Eventful
 * @constructor
 */
var Eventful = function () {
    this._$handlers = {};              //记录所有绑定的事件  格式  {mouseover：[],  mouseup:[],,,,,}
};

Eventful.prototype = {

    constructor: Eventful,

    /**
     * 单次触发绑定，trigger后销毁
     *
     * @param {string} event 事件名
     * @param {Function} handler 响应函数
     * @param {Object} context
     */
    one: function (event, handler, context) {
        var _h = this._$handlers;

        if (!handler || !event) {
            return this;
        }

        if (!_h[event]) {
            _h[event] = [];
        }

        for (var i = 0; i < _h[event].length; i++) {
            if (_h[event][i].h === handler) {
                return this;
            }
        }

        _h[event].push({
            h: handler,
            one: true,
            ctx: context || this
        });

        return this;
    },

    /**
     * 绑定事件
     * @param {string} event 事件名
     * @param {Function} handler 事件处理函数
     * @param {Object} [context]
     */
    on: function (event, handler, context) {
        var _h = this._$handlers;

        if (!handler || !event) {
            return this;
        }

        if (!_h[event]) {
            _h[event] = [];
        }

        for (var i = 0; i < _h[event].length; i++) {
            if (_h[event][i].h === handler) {
                return this;
            }
        }

        _h[event].push({                                           // 把对应的handle 以及类型都放入_$handlers   {click:[ {h:handler,one:false,ctx:this} , {} ]            ,  dbclick:[]   ....}
            h: handler,
            one: false,
            ctx: context || this
        });

        return this;
    },

    /**
     * 是否绑定了事件
     * @param  {string}  event
     * @return {boolean}
     */
    isSilent: function (event) {
        var _h = this._$handlers;
        return _h[event] && _h[event].length;
    },

    /**
     * 解绑事件
     * @param {string} event 事件名
     * @param {Function} [handler] 事件处理函数
     */
    off: function (event, handler) {
        var _h = this._$handlers;

        if (!event) {
            this._$handlers = {};
            return this;
        }

        if (handler) {
            if (_h[event]) {
                var newList = [];
                for (var i = 0, l = _h[event].length; i < l; i++) {
                    if (_h[event][i]['h'] != handler) {
                        newList.push(_h[event][i]);
                    }
                }
                _h[event] = newList;
            }

            if (_h[event] && _h[event].length === 0) {
                delete _h[event];
            }
        }
        else {
            delete _h[event];
        }

        return this;
    },

    /**
     * 事件分发                       触发 ，，   扣…的扳机;发射或使爆炸   ，把某个类型的 hander 执行掉。
     *
     * @param {string} type 事件类型           触发对应的绑定的函数，
     */
    trigger: function (type) {
        if (this._$handlers[type]) {
            var args = arguments;
            var argLen = args.length;

            if (argLen > 3) {
                args = arrySlice.call(args, 1);
            }

            var _h = this._$handlers[type];     // 拿出所有的事件数组。
            var len = _h.length;
            for (var i = 0; i < len;) {
                // Optimize advise from backbone
                switch (argLen) {                      // 传入的参数的个数而已
                    case 1:
                        _h[i]['h'].call(_h[i]['ctx']);
                        break;
                    case 2:
                        _h[i]['h'].call(_h[i]['ctx'], args[1]);
                        break;
                    case 3:
                        _h[i]['h'].call(_h[i]['ctx'], args[1], args[2]);
                        break;
                    default:
                        // have more than 2 given arguments
                        _h[i]['h'].apply(_h[i]['ctx'], args);
                        break;
                }

                if (_h[i]['one']) {              // 如果有one属性，运行一次之后 删除掉。
                    _h.splice(i, 1);
                    len--;
                }
                else {
                    i++;
                }
            }
        }

        return this;
    },

    /**
     * 带有context的事件分发, 最后一个参数是事件回调的context
     * @param {string} type 事件类型
     */
    triggerWithContext: function (type) {
        if (this._$handlers[type]) {
            var args = arguments;
            var argLen = args.length;

            if (argLen > 4) {
                args = arrySlice.call(args, 1, args.length - 1);
            }
            var ctx = args[args.length - 1];

            var _h = this._$handlers[type];
            var len = _h.length;
            for (var i = 0; i < len;) {
                // Optimize advise from backbone
                switch (argLen) {
                    case 1:
                        _h[i]['h'].call(ctx);
                        break;
                    case 2:
                        _h[i]['h'].call(ctx, args[1]);
                        break;
                    case 3:
                        _h[i]['h'].call(ctx, args[1], args[2]);
                        break;
                    default:
                        // have more than 2 given arguments
                        _h[i]['h'].apply(ctx, args);
                        break;
                }

                if (_h[i]['one']) {
                    _h.splice(i, 1);
                    len--;
                }
                else {
                    i++;
                }
            }
        }

        return this;
    }
};

// 对象可以通过 onxxxx 绑定事件
/**
 * @event module:zrender/mixin/Eventful#onclick
 * @type {Function}
 * @default null
 */
/**
 * @event module:zrender/mixin/Eventful#onmouseover
 * @type {Function}
 * @default null
 */
/**
 * @event module:zrender/mixin/Eventful#onmouseout
 * @type {Function}
 * @default null
 */
/**
 * @event module:zrender/mixin/Eventful#onmousemove
 * @type {Function}
 * @default null
 */
/**
 * @event module:zrender/mixin/Eventful#onmousewheel
 * @type {Function}
 * @default null
 */
/**
 * @event module:zrender/mixin/Eventful#onmousedown
 * @type {Function}
 * @default null
 */
/**
 * @event module:zrender/mixin/Eventful#onmouseup
 * @type {Function}
 * @default null
 */
/**
 * @event module:zrender/mixin/Eventful#ondrag
 * @type {Function}
 * @default null
 */
/**
 * @event module:zrender/mixin/Eventful#ondragstart
 * @type {Function}
 * @default null
 */
/**
 * @event module:zrender/mixin/Eventful#ondragend
 * @type {Function}
 * @default null
 */
/**
 * @event module:zrender/mixin/Eventful#ondragenter
 * @type {Function}
 * @default null
 */
/**
 * @event module:zrender/mixin/Eventful#ondragleave
 * @type {Function}
 * @default null
 */
/**
 * @event module:zrender/mixin/Eventful#ondragover
 * @type {Function}
 * @default null
 */
/**
 * @event module:zrender/mixin/Eventful#ondrop
 * @type {Function}
 * @default null
 */

export default Eventful;