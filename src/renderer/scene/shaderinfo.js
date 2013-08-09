(function(webgl){

    var getUniqueId = (function(){
        var c_counter = 0;
        return function() {
              return c_counter++;
        }
    }());

    /**
     * @param {XML3D.webgl.Scene} scene
     * @param {Object} opt
     * @constructor
     */
    var ShaderInfo = function(scene, opt) {
        opt = opt || {};
        this.id = getUniqueId();
        this.scene = scene;
        this.data = opt.data;
        /** @type XML3D.URI */
        this.script = opt.script;
        this.scene.shaderInfos.push(this);
    };

    XML3D.extend(ShaderInfo.prototype, {
        setScript: function(script) {
            if(this.script != script) {
                this.script = script;
                this.scriptChangedEvent();
            }
        },
        getScript: function() {
            return this.script;
        },
        getData: function() {
            return this.data;
        },
        scriptChangedEvent: function() {

        }
    });

    webgl.ShaderInfo = ShaderInfo;

}(XML3D.webgl));