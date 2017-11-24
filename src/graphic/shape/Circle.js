/**
 * 圆形
 * @module zrender/shape/Circle
 */

import Path from '../Path';

export default Path.extend({                 //  这个对象 是默认的对象。 就是创建 圆形的默认值    返回的是  var Sub = function (opts) {}）     这个时候传入的opts是实际值

    type: 'circle',

    shape: {
        cx: 0,
        cy: 0,
        r: 0
    },


    buildPath : function (ctx, shape, inBundle) {
        // Better stroking in ShapeBundle
        // Always do it may have performence issue ( fill may be 2x more cost)
        if (inBundle) {
            ctx.moveTo(shape.cx + shape.r, shape.cy);
        }
        // else {
        //     if (ctx.allocate && !ctx.data.length) {
        //         ctx.allocate(ctx.CMD_MEM_SIZE.A);
        //     }
        // }
        // Better stroking in ShapeBundle
        // ctx.moveTo(shape.cx + shape.r, shape.cy);
        ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2, true);
    }
});