// data/texture.js
(function() {
    "use strict";

    var clampToGL = function(modeStr) {
        if (modeStr == "clamp")
            return WebGLRenderingContext.CLAMP_TO_EDGE;
        if (modeStr == "repeat")
            return WebGLRenderingContext.REPEAT;
        return WebGLRenderingContext.CLAMP_TO_EDGE;
    };

    var filterToGL = function(modeStr) {
        if (modeStr == "nearest")
            return WebGLRenderingContext.NEAREST;
        if (modeStr == "linear")
            return WebGLRenderingContext.LINEAR;
        if (modeStr == "mipmap_linear")
            return WebGLRenderingContext.LINEAR_MIPMAP_NEAREST;
        if (modeStr == "mipmap_nearest")
            return WebGLRenderingContext.NEAREST_MIPMAP_NEAREST;
        return WebGLRenderingContext.LINEAR;
    };

    var TextureDataAdapter = function(factory, node) {
        XML3D.data.DataAdapter.call(this, factory, node);
    };
    XML3D.createClass(TextureDataAdapter, XML3D.base.NodeAdapter);

    TextureDataAdapter.prototype.init = function() {
        this.xflowInputNode = this.createXflowNode();
        this.xflowInputNode.data = this.createTextureEntry();
    };

    TextureDataAdapter.prototype.createTextureEntry = function() {
        var node = this.node;
        var entry = new Xflow.TextureEntry(null);
        var config = entry.getSamplerConfig();
        config.wrapS = clampToGL(node.wrapS);
        config.wrapT = clampToGL(node.wrapT);
        config.minFilter = filterToGL(node.filterMin);
        config.magFilter = filterToGL(node.filterMin);

        var imageAdapter = this.factory.getAdapter(this.node.firstElementChild, XML3D.data.XML3DDataAdapterFactory.prototype);
        if(imageAdapter) {
            imageAdapter.setTextureEntry(entry);
        }
        return entry;
    };

    TextureDataAdapter.prototype.createXflowNode = function() {
        var xnode = XML3D.data.xflowGraph.createInputNode();
        xnode.name = this.node.name;
        return xnode;
    };

    TextureDataAdapter.prototype.getOutputs = function() {
        var result = {};
        result[this.node.name] = this;
        return result;
    };

    TextureDataAdapter.prototype.getValue = function() {
        return this.value;
    };

    /**
     * @return {Element}
     */
    TextureDataAdapter.prototype.getXflowNode = function() {
        return this.xflowInputNode;
    };

    /**
     * Returns String representation of this TextureDataAdapter
     */
    TextureDataAdapter.prototype.toString = function() {
        return "XML3D.data.TextureDataAdapter";
    };

    // Export
    XML3D.data.TextureDataAdapter = TextureDataAdapter;

}());