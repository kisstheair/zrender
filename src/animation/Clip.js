/**
 * 动画主控制器
 * @config target 动画对象，可以是数组，如果是数组的话会批量分发onframe等事件
 * @config life(1000) 动画时长
 * @config delay(0) 动画延迟时间
 * @config loop(true)
 * @config gap(0) 循环的间隔时间
 * @config onframe
 * @config easing(optional)
 * @config ondestroy(optional)
 * @config onrestart(optional)
 *
 * TODO pause
 */

import easingFuncs from './easing';

function Clip(options) {                                       // 主动画控制器，  把动画的各种参数，时间，对象，是否循环，执行曲线，执行的函数。。。。   都打包成一个Clip对象， 是动画的最基本单位  放入Animation，会循环获取Clip数组去挨个执行。

    this._target = options.target;

    // 生命周期
    this._life = options.life || 1000;                       // 默认的动画执行周期是1000
    // 延时
    this._delay = options.delay || 0;
    // 开始时间
    // this._startTime = new Date().getTime() + this._delay;             // 单位毫秒
    this._initialized = false;                                        // 已初始化的

    // 是否循环
    this.loop = options.loop == null ? false : options.loop;          // 是不是循环执行

    this.gap = options.gap || 0;

    this.easing = options.easing || 'Linear';                        // 执行的 曲线

    this.onframe = options.onframe;                                   // 当执行的时候的函数
    this.ondestroy = options.ondestroy;                               // 当  的函数
    this.onrestart = options.onrestart;                               // 当重启的函数

    this._pausedTime = 0;
    this._paused = false;
}

Clip.prototype = {

    constructor: Clip,

    step: function (globalTime, deltaTime) {               // 这里的意思就是  globalTime ：从动画执行，现在的时间是。。。      deltaTime ： 从动画执行经过了多长时间。   这里是从时间的角度计算出动画进度百分比 然后换算出来的值传入Clip
        // Set startTime on first step, or _startTime may has milleseconds different between clips
        // PENDING
        if (!this._initialized) {
            this._startTime = globalTime + this._delay;     // 这里定义的是本 clip的开始时间，  开始时间 是相对于 整个animation的时间进度的，  整个animation运行到这，这就是本clip的开始
            this._initialized = true;
        }

        if (this._paused) {
            this._pausedTime += deltaTime;
            return;
        }

        var percent = (globalTime - this._startTime - this._pausedTime) / this._life;          // 应该是 动画进度的百分比吧，    就是动画已经完成了  多少了    【0 -- 1】

        // 还没开始
        if (percent < 0) {
            return;
        }

        percent = Math.min(percent, 1);

        var easing = this.easing;
        var easingFunc = typeof easing == 'string' ? easingFuncs[easing] : easing;
        var schedule = typeof easingFunc === 'function'
            ? easingFunc(percent)
            : percent;

        this.fire('frame', schedule);                                //执行的是 this.onframe(this._target, schedule) 更新目标的状态。  是根据时间来推算出百分比的，所以调用的快慢与动画的完成情况没关系  ，调用的快，只会刷新的频率高。

        // 结束
        if (percent == 1) {
            if (this.loop) {
                this.restart (globalTime);
                // 重新开始周期
                // 抛出而不是直接调用事件直到 stage.update 后再统一调用这些事件
                return 'restart';
            }

            // 动画完成将这个控制器标识为待删除
            // 在Animation.update中进行批量删除
            this._needsRemove = true;
            return 'destroy';
        }

        return null;
    },

    restart: function (globalTime) {
        var remainder = (globalTime - this._startTime - this._pausedTime) % this._life;
        this._startTime = globalTime - remainder + this.gap;
        this._pausedTime = 0;

        this._needsRemove = false;
    },

    fire: function (eventType, arg) {
        eventType = 'on' + eventType;
        if (this[eventType]) {
            this[eventType](this._target, arg);
        }
    },

    pause: function () {
        this._paused = true;
    },

    resume: function () {
        this._paused = false;
    }
};

export default Clip;