/**
 * 动画主类, 调度和管理所有动画控制器
 *
 * @module zrender/animation/Animation
 * @author pissang(https://github.com/pissang)
 */
// TODO Additive animation
// http://iosoteric.com/additive-animations-animatewithduration-in-ios-8/
// https://developer.apple.com/videos/wwdc2014/#236

import * as util from '../core/util';
import {Dispatcher} from '../core/event';
import requestAnimationFrame from './requestAnimationFrame';
import Animator from './Animator';

/**
 * @typedef {Object} IZRenderStage
 * @property {Function} update
 */

/**
 * @alias module:zrender/animation/Animation
 * @constructor
 * @param {Object} [options]
 * @param {Function} [options.onframe]
 * @param {IZRenderStage} [options.stage]
 * @example
 *     var animation = new Animation();
 *     var obj = {
 *         x: 100,
 *         y: 100
 *     };
 *     animation.animate(node.position)
 *         .when(1000, {
 *             x: 500,
 *             y: 500
 *         })
 *         .when(2000, {
 *             x: 100,
 *             y: 100
 *         })
 *         .start('spline');
 */
var Animation = function (options) {

    options = options || {};

    this.stage = options.stage || {};

    this.onframe = options.onframe || function() {};

    // private properties
    this._clips = [];

    this._running = false;       // 是否正在运行的标识

    this._time;                   // 点击开始的时间点

    this._pausedTime;            // 恢复之后，（恢复时间点 -  暂停时间点的 ） 时间间隔。

    this._pauseStart;            // 暂停的那个时间点

    this._paused = false;         // 是否暂停的标识

    Dispatcher.call(this);
};

Animation.prototype = {

    constructor: Animation,





    /**                                                               对动画片段的维护。
     * 添加 clip
     * @param {module:zrender/animation/Clip} clip                    单独添加一个片段。
     */
    addClip: function (clip) {
        this._clips.push(clip);
    },
    /**
     * 添加 animator
     * @param {module:zrender/animation/Animator} animator            animation是所有动画的一个统称，   animator是一个动画集合，包含多个clip动画片段，    这个函数，就是把一个动画集合的所有片段放入大海中。
     */
    addAnimator: function (animator) {
        animator.animation = this;
        var clips = animator.getClips();
        for (var i = 0; i < clips.length; i++) {
            this.addClip(clips[i]);
        }
    },
    /**
     * 删除动画片段
     * @param {module:zrender/animation/Clip} clip
     */
    removeClip: function(clip) {
        var idx = util.indexOf(this._clips, clip);
        if (idx >= 0) {
            this._clips.splice(idx, 1);
        }
    },

    /**
     * 删除动画片段
     * @param {module:zrender/animation/Animator} animator
     */
    removeAnimator: function (animator) {
        var clips = animator.getClips();
        for (var i = 0; i < clips.length; i++) {
            this.removeClip(clips[i]);
        }
        animator.animation = null;
    },
    /**
     * 清除所有动画片段
     */
    clear: function () {
        this._clips = [];
    },











    _update: function() {

        var time = new Date().getTime() - this._pausedTime;  //
        var delta = time - this._time;                       // 动画总共运行的时间。
        var clips = this._clips;
        var len = clips.length;

        var deferredEvents = [];
        var deferredClips = [];
        for (var i = 0; i < len; i++) {
            var clip = clips[i];
            var e = clip.step(time, delta);
            // Throw out the events need to be called after
            // stage.update, like destroy
            if (e) {
                deferredEvents.push(e);
                deferredClips.push(clip);
            }
        }

        // Remove the finished clip           删除掉  动画结束的 chip
        for (var i = 0; i < len;) {
            if (clips[i]._needsRemove) {
                clips[i] = clips[len - 1];
                clips.pop();
                len--;
            }
            else {
                i++;
            }
        }

        len = deferredEvents.length;
        for (var i = 0; i < len; i++) {
            deferredClips[i].fire(deferredEvents[i]);
        }

        this._time = time;

        this.onframe(delta);

        this.trigger('frame', delta);

        if (this.stage.update) {
            this.stage.update();
        }
    },             // 实际更新动画。

    _startLoop: function () {
        var self = this;

        this._running = true;

        function step() {
            if (self._running) {                     // 总的运行标识， 如果开 那么久一直运行下去。

                requestAnimationFrame(step);

                !self._paused && self._update();     // 只有在不暂停的情况下，才回去 更新动画。
            }
        }

        requestAnimationFrame(step);
    },         // 根据 进行，暂停的标识  ------总进度控制。

    /**
     * 开始运行动画
     */
    start: function () {

        this._time = new Date().getTime();
        this._pausedTime = 0;

        this._startLoop();
    },
    /**
     * 停止运行动画
     */
    stop: function () {
        this._running = false;
    },

    /**
     * Pause 暂停
     */
    pause: function () {
        if (!this._paused) {
            this._pauseStart = new Date().getTime();
            this._paused = true;
        }
    },

    /**
     * Resume      继续;恢复职位
     */
    resume: function () {
        if (this._paused) {
            this._pausedTime += (new Date().getTime()) - this._pauseStart;
            this._paused = false;
        }
    },


    /**
     * 对一个目标创建一个animator对象，可以指定目标中的属性使用动画
     * @param  {Object} target
     * @param  {Object} options
     * @param  {boolean} [options.loop=false] 是否循环播放动画
     * @param  {Function} [options.getter=null]
     *         如果指定getter函数，会通过getter函数取属性值
     * @param  {Function} [options.setter=null]
     *         如果指定setter函数，会通过setter函数设置属性值
     * @return {module:zrender/animation/Animation~Animator}
     */
    // TODO Gap
    animate: function (target, options) {
        options = options || {};

        var animator = new Animator(
            target,                            // 动画的目标元素
            options.loop,                     //是不是循环
            options.getter,                   //目标的属性获取函数
            options.setter                    //。。。
        );

        this.addAnimator(animator);

        return animator;
    }
};

util.mixin(Animation, Dispatcher);

export default Animation;