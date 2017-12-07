/**
 * @module echarts/animation/Animator
 */

import Clip from './Clip';
import * as color from '../tool/color';
import {isArrayLike} from '../core/util';

var arraySlice = Array.prototype.slice;

function defaultGetter(target, key) {
    return target[key];
}

function defaultSetter(target, key, value) {
    target[key] = value;
}

/**
 * @param  {number} p0
 * @param  {number} p1
 * @param  {number} percent
 * @return {number}
 */
function interpolateNumber(p0, p1, percent) {
    return (p1 - p0) * percent + p0;
}

/**
 * @param  {string} p0
 * @param  {string} p1
 * @param  {number} percent
 * @return {string}
 */
function interpolateString(p0, p1, percent) {
    return percent > 0.5 ? p1 : p0;
}

/**
 * @param  {Array} p0
 * @param  {Array} p1
 * @param  {number} percent
 * @param  {Array} out
 * @param  {number} arrDim
 */
function interpolateArray(p0, p1, percent, out, arrDim) {
    var len = p0.length;
    if (arrDim == 1) {
        for (var i = 0; i < len; i++) {
            out[i] = interpolateNumber(p0[i], p1[i], percent);
        }
    }
    else {
        var len2 = len && p0[0].length;
        for (var i = 0; i < len; i++) {
            for (var j = 0; j < len2; j++) {
                out[i][j] = interpolateNumber(
                    p0[i][j], p1[i][j], percent
                );
            }
        }
    }
}

// arr0 is source array, arr1 is target array.
// Do some preprocess to avoid error happened when interpolating from arr0 to arr1        arr0 是第几个value对应的数组，  arr1是最后一个value对应的数组。 这里想要做成一致，避免出错。
function fillArr(arr0, arr1, arrDim) {
    var arr0Len = arr0.length;
    var arr1Len = arr1.length;
    if (arr0Len !== arr1Len) {                                                        // 如果数组的长度不相同的话，  前面的长，多余的去掉保持和后面最后一个长度一致， 如果后面的长，后面多余的添加到前面当成默认。
        // FIXME Not work for TypedArray
        var isPreviousLarger = arr0Len > arr1Len;
        if (isPreviousLarger) {
            // Cut the previous
            arr0.length = arr1Len;
        }
        else {
            // Fill the previous
            for (var i = arr0Len; i < arr1Len; i++) {
                arr0.push(
                    arrDim === 1 ? arr1[i] : arraySlice.call(arr1[i])
                );
            }
        }
    }
    // Handling NaN value                              上面解决了长度的问题， 这里处理一下各个值得问题，如果是NaN了，   把最后一个的值填充到前面。
    var len2 = arr0[0] && arr0[0].length;
    for (var i = 0; i < arr0.length; i++) {
        if (arrDim === 1) {
            if (isNaN(arr0[i])) {
                arr0[i] = arr1[i];
            }
        }
        else {
            for (var j = 0; j < len2; j++) {
                if (isNaN(arr0[i][j])) {
                    arr0[i][j] = arr1[i][j];
                }
            }
        }
    }
}

/**
 * @param  {Array} arr0
 * @param  {Array} arr1
 * @param  {number} arrDim
 * @return {boolean}
 */
function isArraySame(arr0, arr1, arrDim) {
    if (arr0 === arr1) {
        return true;
    }
    var len = arr0.length;
    if (len !== arr1.length) {
        return false;
    }
    if (arrDim === 1) {
        for (var i = 0; i < len; i++) {
            if (arr0[i] !== arr1[i]) {
                return false;
            }
        }
    }
    else {
        var len2 = arr0[0].length;
        for (var i = 0; i < len; i++) {
            for (var j = 0; j < len2; j++) {
                if (arr0[i][j] !== arr1[i][j]) {
                    return false;
                }
            }
        }
    }
    return true;
}

/**
 * Catmull Rom interpolate array
 * @param  {Array} p0
 * @param  {Array} p1
 * @param  {Array} p2
 * @param  {Array} p3
 * @param  {number} t
 * @param  {number} t2
 * @param  {number} t3
 * @param  {Array} out
 * @param  {number} arrDim
 */
function catmullRomInterpolateArray(
    p0, p1, p2, p3, t, t2, t3, out, arrDim
) {
    var len = p0.length;
    if (arrDim == 1) {
        for (var i = 0; i < len; i++) {
            out[i] = catmullRomInterpolate(
                p0[i], p1[i], p2[i], p3[i], t, t2, t3
            );
        }
    }
    else {
        var len2 = p0[0].length;
        for (var i = 0; i < len; i++) {
            for (var j = 0; j < len2; j++) {
                out[i][j] = catmullRomInterpolate(
                    p0[i][j], p1[i][j], p2[i][j], p3[i][j],
                    t, t2, t3
                );
            }
        }
    }
}

/**
 * Catmull Rom interpolate number
 * @param  {number} p0
 * @param  {number} p1
 * @param  {number} p2
 * @param  {number} p3
 * @param  {number} t
 * @param  {number} t2
 * @param  {number} t3
 * @return {number}
 */
function catmullRomInterpolate(p0, p1, p2, p3, t, t2, t3) {
    var v0 = (p2 - p0) * 0.5;
    var v1 = (p3 - p1) * 0.5;
    return (2 * (p1 - p2) + v0 + v1) * t3
            + (-3 * (p1 - p2) - 2 * v0 - v1) * t2
            + v0 * t + p1;
}

function cloneValue(value) {
    if (isArrayLike(value)) {
        var len = value.length;
        if (isArrayLike(value[0])) {
            var ret = [];
            for (var i = 0; i < len; i++) {
                ret.push(arraySlice.call(value[i]));
            }
            return ret;
        }

        return arraySlice.call(value);
    }

    return value;
}

function rgba2String(rgba) {
    rgba[0] = Math.floor(rgba[0]);
    rgba[1] = Math.floor(rgba[1]);
    rgba[2] = Math.floor(rgba[2]);

    return 'rgba(' + rgba.join(',') + ')';
}

function getArrayDim(keyframes) {
    var lastValue = keyframes[keyframes.length - 1].value;
    return isArrayLike(lastValue && lastValue[0]) ? 2 : 1;
}




//     this,                                  // animator
//     easing,                                 // 缓动动画函数，  或者是缓动动画的 曲线字符串
//     oneTrackDone,                           // 完成一个帧  之后要做的事，  是一个函数      （每次完成之后都要去执行一次，查看是否已经全部完成了， 如果全部完成了，  那就开始执行完成后的回调函数了）
//     this._tracks[propName],                //应该是一个数组 [{time:0,value:20}, {time:20,value:100}]     。     _tracks是关键帧{ cx:[{time:0,value:20}, {time:20,value:100}]    ,   cy:[{} ]  }
//     propName,                               // 属性名 cx
//     forceAnimate                            //是否强制 渲染。

function createTrackClip(animator, easing, oneTrackDone, keyframes, propName, forceAnimate) {
    var getter = animator._getter;
    var setter = animator._setter;
    var useSpline = easing === 'spline';

    var trackLen = keyframes.length;
    if (!trackLen) {
        return;
    }
    // Guess data type                     一个动画有多个关键帧， 每一个帧 都有一个value，   这个value是什么样的呢？  这里并不知道。  有可能是数字 ， 有可能是颜色吧 可能是字符串。
    var firstVal = keyframes[0].value;
    var isValueArray = isArrayLike(firstVal);
    var isValueColor = false;
    var isValueString = false;

    // For vertices morphing
    var arrDim = isValueArray ? getArrayDim(keyframes) : 0;   // 如果 不是数组的话   arrDim=0，  如果是数组并且里面的值不是数组  arrDim=1，  如果是数组并且里面的数据还是数组 arrDim =2

    var trackMaxTime;
    // Sort keyframe as ascending                          关键帧按时间排序一下。
    keyframes.sort(function(a, b) {
        return a.time - b.time;
    });

    trackMaxTime = keyframes[trackLen - 1].time;           //动画的最大时间。  （这个动画需要运行多久）
    // Percents of each keyframe
    var kfPercents = [];
    // Value of each keyframe
    var kfValues = [];
    var prevValue = keyframes[0].value;
    var isAllValueEqual = true;
    for (var i = 0; i < trackLen; i++) {
        kfPercents.push(keyframes[i].time / trackMaxTime);    // 记录每一个关键帧时间  -在整个动画中的百分比
        // Assume value is a color when it is a string
        var value = keyframes[i].value;

        // Check if value is equal, deep check if value is array
        if (!((isValueArray && isArraySame(value, prevValue, arrDim))           // 判断是不是这个value  和prevValue 完全相等。
            || (!isValueArray && value === prevValue))) {
            isAllValueEqual = false;                                           // 动画有多个帧，  如果各个值都相等 ，动画没意义， ------这里判断的如果有一个不想等isAllValueEqual = false;    说明可以做动画
        }
        prevValue = value;

        // Try converting a string to a color array
        if (typeof value == 'string') {
            var colorArray = color.parse(value);
            if (colorArray) {
                value = colorArray;
                isValueColor = true;
            }
            else {
                isValueString = true;
            }
        }
        kfValues.push(value);                                 // kfValues里面放入的是值，  可能是   原来的数值数组   /  color数组 / 原来的字符串。
    }
    if (!forceAnimate && isAllValueEqual) {                    // 这里如果不是强制动画，并且所有的值都相等， 那就别做了， 返回空。
        return;
    }

    var lastValue = kfValues[trackLen - 1];
    // Polyfill array and NaN value                          遍历kfValues的所有的值，  长度要和最后一个保持一致，  如果有NaN值，  最后一个的值覆盖到前面。
    for (var i = 0; i < trackLen - 1; i++) {
        if (isValueArray) {
            fillArr(kfValues[i], lastValue, arrDim);
        }
        else {
            if (isNaN(kfValues[i]) && !isNaN(lastValue) && !isValueString && !isValueColor) {
                kfValues[i] = lastValue;
            }
        }
    }
    isValueArray && fillArr(getter(animator._target, propName), lastValue, arrDim);           //把动画的结束值赋给  动画的_target，，那么动画的_target就代表的是动画的 目标，动画的结束状态。

    // Cache the key of last frame to speed up when
    // animation playback is sequency
    var lastFrame = 0;
    var lastFramePercent = 0;            //每一个动画 划分为 多个chip ，也就是多个变动，多个关键帧         ，  这里是保存整个动画进度的地方，   下面的单独的Clip 的onframe函数 每次执行都会修改整体的进度。
    var start;
    var w;                              //   （这次的进度值-上次的进度）/ 值的变动量             (percent - kfPercents[frame]) / range;
    var p0;
    var p1;
    var p2;
    var p3;

    if (isValueColor) {
        var rgba = [0, 0, 0, 0];
    }

    var onframe = function (target, percent) {           // target是动画的结束状态，目标         percent 是动画完成的百分比，  进度  范围是【0 --  1】
        // Find the range keyframes
        // kf1-----kf2---------current--------kf3
        // find kf2 and kf3 and do interpolation  插补;
        var frame;
        // In the easing function like elasticOut, percent may less than 0
        if (percent < 0) {                                                  //判断这次动画的进度到哪里了？  刚开始，还是上次进度50% 这次却传进来20%，    还是正常的进度上次50% 这次60%
            frame = 0;
        }
        else if (percent < lastFramePercent) {                           // 如果这次传进来的进度  ，还没有上次的进度多，  难道要倒回去播放呀！ 对呀，从新找到比传进来的进度小的上一次关键帧 。
            // Start from next key
            // PENDING start from lastFrame ?
            start = Math.min(lastFrame + 1, trackLen - 1);
            for (frame = start; frame >= 0; frame--) {
                if (kfPercents[frame] <= percent) {
                    break;
                }
            }
            // PENDING really need to do this ?
            frame = Math.min(frame, trackLen - 2);
        }
        else {                                                              // 如果这次传进来的进度正常， 那也有可能是跳着关键帧找的，    那么找到percent 的前一个关键帧作为上一次的关键帧。
            for (frame = lastFrame; frame < trackLen; frame++) {
                if (kfPercents[frame] > percent) {
                    break;
                }
            }
            frame = Math.min(frame - 1, trackLen - 2);
        }
        lastFrame = frame;                                      // 上一个关键帧
        lastFramePercent = percent;                              // 上一个关键帧的 进度

        var range = (kfPercents[frame + 1] - kfPercents[frame]);    //动画进度变动量。
        if (range === 0) {
            return;
        }
        else {
            w = (percent - kfPercents[frame]) / range;              //     这次的进度到上一个的关键的间距 / 上一个关键帧到下一个关键的幅度   =  这次的动画进度在2个关键帧中间的占比
        }
        if (useSpline) {                                              // 如果 函数曲线 easing === 'spline';   花键;方栓;齿条;
            p1 = kfValues[frame];
            p0 = kfValues[frame === 0 ? frame : frame - 1];
            p2 = kfValues[frame > trackLen - 2 ? trackLen - 1 : frame + 1];
            p3 = kfValues[frame > trackLen - 3 ? trackLen - 1 : frame + 2];
            if (isValueArray) {
                catmullRomInterpolateArray(
                    p0, p1, p2, p3, w, w * w, w * w * w,
                    getter(target, propName),
                    arrDim
                );
            }
            else {
                var value;
                if (isValueColor) {
                    value = catmullRomInterpolateArray(
                        p0, p1, p2, p3, w, w * w, w * w * w,
                        rgba, 1
                    );
                    value = rgba2String(rgba);
                }
                else if (isValueString) {
                    // String is step(0.5)
                    return interpolateString(p1, p2, w);
                }
                else {
                    value = catmullRomInterpolate(
                        p0, p1, p2, p3, w, w * w, w * w * w
                    );
                }
                setter(
                    target,
                    propName,
                    value
                );
            }
        }
        else {
            if (isValueArray) {
                interpolateArray(
                    kfValues[frame], kfValues[frame + 1], w,
                    getter(target, propName),
                    arrDim
                );
            }
            else {
                var value;
                if (isValueColor) {
                    interpolateArray(
                        kfValues[frame],            //上次的值
                        kfValues[frame + 1],        //下次的值
                        w,                          //（这次的进度值-上次的进度）/ 值的变动量        (percent - kfPercents[frame]) / range;  占比
                        rgba,                      //
                        1                          //
                    );
                    value = rgba2String(rgba);
                }
                else if (isValueString) {
                    // String is step(0.5)
                    return interpolateString(kfValues[frame], kfValues[frame + 1], w);
                }
                else {
                    value = interpolateNumber(kfValues[frame], kfValues[frame + 1], w);
                }
                setter(
                    target,
                    propName,
                    value
                );
            }
        }
    };

    var clip = new Clip({
        target: animator._target,               //  动画要执行的对象，  也就是 我们定义的Element对象
        life: trackMaxTime,                      //  最大时间 （动画持续的时间）
        loop: animator._loop,                   //  是不是循环
        delay: animator._delay,                 //  默认用animator的延迟时间 0     this._delay = 0;
        onframe: onframe,                        //
        ondestroy: oneTrackDone                 // 每次Clip结束后要去执行的函数  ---------------------这里放的函数是：检测动画的所有片段都完成没，如果全部完成， 那就开始执行 完成后的回调函数。
    });

    if (easing && easing !== 'spline') {
        clip.easing = easing;
    }

    return clip;
}

/**
 * @alias module:zrender/animation/Animator
 * @constructor
 * @param {Object} target
 * @param {boolean} loop
 * @param {Function} getter
 * @param {Function} setter
 */
var Animator = function(target, loop, getter, setter) {      // Animator  是一个动画组合， 可以拆分长多个Clip 放入到自己的   _clipList 数组中，   当调用 Animation.addAnimator 的时候，会直接获取 这个动画的_clipList， 放入到  animation中去  。 （zr.animation.addAnimator(animator);）
    this._tracks = {};                                      // 关键帧， 轨迹对象。{ cx:[{time:0,value:20}, {time:20,value:100}]    ,   cy:[{} ]  }
    this._target = target;                                  // target是动画的目标，---- ---- 动画创建的时候： target=获取的初始状态----- 通过circle.animate('shape', true)获取   {cx: 30, cy: 200, r: 30}

    this._loop = loop || false;

    this._getter = getter || defaultGetter;
    this._setter = setter || defaultSetter;

    this._clipCount = 0;

    this._delay = 0;

    this._doneList = [];

    this._onframeList = [];

    this._clipList = [];                        // clip 是一个动画片段，   _clipList是动画片段的列表
};

Animator.prototype = {
    /**
     * 设置动画关键帧
     * @param  {number} time 关键帧时间，单位是ms
     * @param  {Object} props 关键帧的属性值，key-value表示
     * @return {module:zrender/animation/Animator}
     */
    when: function(time /* ms */, props) {               // when方法 就是人为的去给动画添加  关键帧状态值， 当时间为多少时---什么状态，  当多少时-----什么状态。 circle.animate('shape', true) .when(5000, {}） .when(6000, {）
        var tracks = this._tracks;                      // 应该是记录  一系列关键帧的对象，    跟踪摄影;留下（脏）足迹;
        for (var propName in props) {
            if (!props.hasOwnProperty(propName)) {
                continue;
            }

            if (!tracks[propName]) {                            // 如果关键帧中  还没有这个属性的动画，  那么初始化一下，  并且设置 time：0的关键帧。
                tracks[propName] = [];
                // Invalid value
                var value = this._getter(this._target, propName);
                if (value == null) {
                    // zrLog('Invalid property ' + propName);
                    continue;
                }
                // If time is 0
                //  Then props is given initialize value
                // Else
                //  Initialize value from current prop value
                if (time !== 0) {
                    tracks[propName].push({
                        time: 0,
                        value: cloneValue(value)
                    });
                }
            }
            tracks[propName].push({
                time: time,
                value: props[propName]
            });
        }
        return this;
    },
    /**
     * 添加动画每一帧的回调函数
     * @param  {Function} callback
     * @return {module:zrender/animation/Animator}
     */
    during: function (callback) {
        this._onframeList.push(callback);
        return this;
    },

    pause: function () {
        for (var i = 0; i < this._clipList.length; i++) {
            this._clipList[i].pause();
        }
        this._paused = true;
    },

    resume: function () {
        for (var i = 0; i < this._clipList.length; i++) {
            this._clipList[i].resume();
        }
        this._paused = false;
    },

    isPaused: function () {
        return !!this._paused;
    },

    _doneCallback: function () {
        // Clear all tracks
        this._tracks = {};
        // Clear all clips
        this._clipList.length = 0;

        var doneList = this._doneList;
        var len = doneList.length;
        for (var i = 0; i < len; i++) {
            doneList[i].call(this);
        }
    },
    /**
     * 开始执行动画
     * @param  {string|Function} [easing]
     *         动画缓动函数，详见{@link module:zrender/animation/easing}
     * @param  {boolean} forceAnimate
     * @return {module:zrender/animation/Animator}
     */
    start: function (easing, forceAnimate) {

        var self = this;
        var clipCount = 0;

        var oneTrackDone = function() {
            clipCount--;
            if (!clipCount) {
                self._doneCallback();
            }
        };

        var lastClip;
        for (var propName in this._tracks) {                       //根据什么？ 应该是一个绘制图形的元素，比如形状长度 x，宽度 y ，半径 r   去创建一个一个的 Clip     ，每个有几个关键帧 cx:[{time:0,value:20}, {time:20,value:100}] 成为一个chip
            if (!this._tracks.hasOwnProperty(propName)) {
                continue;
            }
            var clip = createTrackClip(
                this,                                  // animator
                easing,                                 // 缓动动画函数，  或者是缓动动画的 曲线字符串
                oneTrackDone,                           // 完成一个帧  之后要做的事，  是一个函数      （每次完成之后都要去执行一次，查看是否已经全部完成了， 如果全部完成了，  那就开始执行完成后的回调函数了）
                this._tracks[propName],                //应该是一个数组 [{time:0,value:20}, {time:20,value:100}]    。     _tracks是关键帧 { cx:[{time:0,value:20}, {time:20,value:100}]    ,   cy:[{} ]  }
                propName,                               // 属性名 shape
                forceAnimate                            //是否强制 渲染。
            );
            if (clip) {
                this._clipList.push(clip);
                clipCount++;

                // If start after added to animation
                if (this.animation) {
                    this.animation.addClip(clip);
                }

                lastClip = clip;
            }
        }

        // Add during callback on the last clip
        if (lastClip) {
            var oldOnFrame = lastClip.onframe;
            lastClip.onframe = function (target, percent) {
                oldOnFrame(target, percent);

                for (var i = 0; i < self._onframeList.length; i++) {
                    self._onframeList[i](target, percent);
                }
            };
        }

        // This optimization will help the case that in the upper application
        // the view may be refreshed frequently, where animation will be
        // called repeatly but nothing changed.
        if (!clipCount) {
            this._doneCallback();
        }
        return this;
    },
    /**
     * 停止动画
     * @param {boolean} forwardToLast If move to last frame before stop
     */
    stop: function (forwardToLast) {
        var clipList = this._clipList;
        var animation = this.animation;
        for (var i = 0; i < clipList.length; i++) {
            var clip = clipList[i];
            if (forwardToLast) {
                // Move to last frame before stop
                clip.onframe(this._target, 1);
            }
            animation && animation.removeClip(clip);
        }
        clipList.length = 0;
    },
    /**
     * 设置动画延迟开始的时间
     * @param  {number} time 单位ms
     * @return {module:zrender/animation/Animator}
     */
    delay: function (time) {
        this._delay = time;
        return this;
    },
    /**
     * 添加动画结束的回调
     * @param  {Function} cb
     * @return {module:zrender/animation/Animator}
     */
    done: function(cb) {
        if (cb) {
            this._doneList.push(cb);
        }
        return this;
    },

    /**
     * @return {Array.<module:zrender/animation/Clip>}
     */
    getClips: function () {
        return this._clipList;
    }
};

export default Animator;