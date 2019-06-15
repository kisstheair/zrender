/**
 * 多边形            创建多边形，不是原生的方法， 这里是自己创造的
 * @module zrender/shape/Polygon
 */

import Path from '../Path';
import * as polyHelper from '../helper/poly';

export default Path.extend({

    type: 'polygon',

    shape: {
        points: null,                     // 定义几个点  如 points: [[50, 50], [200, 10], [100, 200], [50, 150], [10, 70]],

        smooth: false,                   // 定义拐角光滑度 smooth: 0.5

        smoothConstraint: null
    },

    buildPath: function (ctx, shape) {
        polyHelper.buildPath(ctx, shape, true);     //自己定的规则，自己去解析         借助 多边形  和平滑度工具 去绘制
    }
});