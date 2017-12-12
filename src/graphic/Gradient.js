
/**
 * @param {Array.<Object>} colorStops               步进的  梯度的  渐变的。
 */
var Gradient = function (colorStops) {

    this.colorStops = colorStops || [];

};

Gradient.prototype = {

    constructor: Gradient,

    addColorStop: function (offset, color) {
        this.colorStops.push({

            offset: offset,

            color: color
        });
    }

};

export default Gradient;