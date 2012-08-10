﻿(function() {

    /**********************************************
     * Class XML3D.webgl.XML3DShaderManager
     *
     * The XML3DShaderManager is an abstraction between the renderer and WebGL. It handles the creation and management
     * of all shaders used in the scene, including internal shaders (eg. picking shader).
     *
     **********************************************/
    var TEXTURE_STATE = {
            INVALID: -1,
            UNLOADED: 0,
            LOADED: 1,
            VALID: 2
    };

    var TextureInfo = function(opt) {
        opt = opt || {};
        this.status = TEXTURE_STATE.INVALID;
        this.onload = opt.onload;
    };

    TextureInfo.prototype.createEmpty = function(gl, unit, image) {
        this.status = TEXTURE_STATE.UNLOADED;
        this.handle =  gl.createTexture();
        this.unit = unit;
        this.image = image;
    };

    TextureInfo.prototype.setLoaded = function() {
        if(this.status != TEXTURE_STATE.UNLOADED)
            XML3D.debug.logError("Trying to set Texture with state " + this.status + " to 'loaded'" );
        this.status = TEXTURE_STATE.LOADED;
        if(this.onload)
            this.onload.call(this);
    };

    TextureInfo.prototype.setOptions = function(opt) {
        this.options = opt;
    };

    var InvalidTexture = function() {
        this.status = TEXTURE_STATE.INVALID;
    };

    var EMPTY_TEXTURE = null;
    var createEmptyTexture = function(gl) {
        var handle =  gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, handle);
        var data = new Uint8Array([255,128,128,255]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,  1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        EMPTY_TEXTURE = handle;
    };

    var XML3DShaderManager = function(gl, renderer, dataFactory, factory) {
    	this.gl = gl;
    	this.renderer = renderer;
    	this.dataFactory = dataFactory;
    	this.factory = factory;
    	this.currentProgram = null;
    	this.shaders = {};

    	createEmptyTexture(gl);

    	//Always create a default flat shader as a fallback for error handling
    var fallbackShader = this.getStandardShaderProgram("matte");
    	fallbackShader.hasTransparency = false;
    	this.bindShader(fallbackShader);
    	this.setUniform(gl, fallbackShader.uniforms["diffuseColor"], [1, 0, 0]);
    	this.unbindShader(fallbackShader);
    	this.shaders["defaultShader"] = fallbackShader;

    	//Create picking shaders
    this.shaders["picking"] = this.getStandardShaderProgram("picking");
    this.shaders["pickedNormals"] = this.getStandardShaderProgram("pickedNormals");
    };

    XML3DShaderManager.prototype.createShader = function(shaderAdapter, lights) {
    	//This method is 'suboptimal', but will be replaced with the new modular shader system
    	var shader = null;
    	var shaderId = "defaultShader";
    	var shaderNode = null;

    	if (shaderAdapter) {
    		shaderNode = shaderAdapter.node;
    		shaderId = shaderNode.id;
    	}

        shader = this.shaders[shaderId];

        if (shader)
            return shaderId;

        var flags = {hasTextures : false, hasTransparency : false, hasVColors : false};

        if (shaderAdapter) {
            var dataTable = shaderAdapter.requestData(["transparency", "diffuseTexture", "specularTexture", "normalTexture", "useVertexColor"]);
    	    if (dataTable.transparency) {
    	        flags.hasTransparency = dataTable.transparency.value[0] > 0;
    	    }
    	    flags.hasTextures = dataTable.diffuseTexture !== undefined;
    	    flags.hasVColors = dataTable.useVertexColor && dataTable.useVertexColor.value[0] == true;
        }

    	if (shaderNode && shaderNode.hasAttribute("script"))
    	{
    		var scriptURL = shaderNode.getAttribute("script");
    		if (new XML3D.URI(scriptURL).scheme == "urn") {
            //Internal shader
            var sources = this.getStandardShaderSource(scriptURL, shaderAdapter, lights, flags);
            shader = this.createShaderFromSources(sources);
    		} else {
                //User-provided shader
                var sources = {};
    			var vsScript = XML3D.URIResolver.resolve(scriptURL+ "-vs");
    			var fsScript = XML3D.URIResolver.resolve(scriptURL+ "-fs");
    			if (vsScript && fsScript) {
                sources.vertex = vsScript.textContent;
                sources.fragment = fsScript.textContent;
    			}

                shader = this.createShaderFromSources(sources);
    		}
    		shader.hasTransparency = flags.hasTransparency;
    		this.shaders[shaderId] = shader;
    	} else {
    		// Create the default flat shader
    		shader = this.shaders["defaultShader"];
    		shaderId = "defaultShader";
    	}

    	if (shaderAdapter) {
    		var texturesCreated = this.createTextures(shader, shaderAdapter);
    		if (!texturesCreated) {
    			this.destroyShader(shader);
    			shaderId = "defaultShader";
    		}
    		else {
    			//Set all uniform variables
    			var nameArray = [];
    			for (var name in shader.uniforms) {
    				nameArray.push(name);
    			}
    			var dataTable = shaderAdapter.requestData(nameArray);
    			this.setUniformVariables(shader, dataTable);
    		}
    	}

       return shaderId;
    };

    XML3DShaderManager.prototype.getStandardShaderSource = function(scriptURL, shaderAdapter, lights, flags) {
    	//Need to check for textures to decide which internal shader to use
    var sources = {vertex:null, fragment:null};
    var shaderName = scriptURL.substring(scriptURL.lastIndexOf(':')+1);

    //Need to check for textures to decide which internal shader to use
    if (flags.hasTextures && (shaderName == "phong" || shaderName == "diffuse"))
        shaderName = "textured"+shaderName;

    	if (flags.hasVColors)
        shaderName += "vcolor";

    switch (shaderName) {
        case "phong":
        case "texturedphong":
        case "phongvcolor":
        case "diffuse":
        case "textureddiffuse":
        case "diffusevcolor":
        case "normal":
        case "reflection":
            // Workaround for lack of dynamic loops on ATI cards below the HD 5000 line
            var template = XML3D.shaders.getScript(shaderName);
            var maxLights = "";
            maxLights += "#define MAX_POINTLIGHTS " + lights.point.length.toString() + "\n";
            maxLights += "#define MAX_DIRECTIONALLIGHTS " + lights.directional.length.toString() + "\n";
            sources.vertex = maxLights + template.vertex;
            sources.fragment = maxLights + template.fragment;
            sources.uniforms = template.uniforms;
            break;
        default:
            sources = XML3D.shaders.getScript(shaderName);
    }
    return sources;
    };

    XML3DShaderManager.prototype.getStandardShaderProgram = function(name) {
    	var sources = {};

    sources = XML3D.shaders.getScript(name);
    if (!sources || !sources.vertex) {
        sources = {};
        XML3D.debug.logError("Unknown shader: "+name+". Using flat shader instead.");
    	}

    	var shaderProgram = this.createShaderFromSources(sources);

    	return shaderProgram;
    };

    XML3DShaderManager.prototype.createShaderFromSources = function(sources) {
    	var gl = this.gl;

    if (!sources.vertex || !sources.fragment) {
    		return this.shaders["defaultShader"];
    	}

    	var prg = gl.createProgram();

    var vShader = this.compileShader(gl.VERTEX_SHADER, sources.vertex);
    var fShader = this.compileShader(gl.FRAGMENT_SHADER, sources.fragment);

    	if (vShader === null || fShader === null) {
    		//Use a default flat shader instead
    		return this.shaders["defaultShader"];
    	}

    	//Link shader program
    	gl.attachShader(prg, vShader);
    	gl.attachShader(prg, fShader);
    	gl.linkProgram(prg);

    	if (gl.getProgramParameter(prg, gl.LINK_STATUS) == 0) {
    		var errorString = "Shader linking failed: \n";
    		errorString += gl.getProgramInfoLog(prg);
    		errorString += "\n--------\n";
    		XML3D.debug.logError(errorString);
    		gl.getError();

    		return this.shaders["defaultShaders"];
    	}

    	var programObject = {
    			attributes 	: {},
    			uniforms 	: {},
    			samplers	: {},
    			handle		: prg,
    			vSource		: sources.vertex,
    			fSource		: sources.fragment
    	};

    	gl.useProgram(prg);

    	//Tally shader attributes
    	var numAttributes = gl.getProgramParameter(prg, gl.ACTIVE_ATTRIBUTES);
    	for (var i=0; i<numAttributes; i++) {
    		var att = gl.getActiveAttrib(prg, i);
    		if (!att) continue;
    		var attInfo = {};
    		attInfo.name = att.name;
    		attInfo.size = att.size;
    		attInfo.glType = att.type;
    		attInfo.location = gl.getAttribLocation(prg, att.name);
    		programObject.attributes[att.name] = attInfo;
    	}

    	//Tally shader uniforms and samplers
    	var texCount = 0;
    	var numUniforms = gl.getProgramParameter(prg, gl.ACTIVE_UNIFORMS);
    	for (var i=0; i<numUniforms; i++) {
    		var uni = gl.getActiveUniform(prg, i);
    		if (!uni) continue;
    		var uniInfo = {};
    		uniInfo.name = uni.name;
    		uniInfo.size = uni.size;
    		uniInfo.glType = uni.type;
    		uniInfo.location = gl.getUniformLocation(prg, uni.name);

    		if (uni.type == gl.SAMPLER_2D || uni.type == gl.SAMPLER_CUBE) {
    			uniInfo.texUnit = texCount;
    			programObject.samplers[uni.name] = uniInfo;
    			texCount++;
    		}
    		else 
    			programObject.uniforms[uni.name] = uniInfo;
    	}
    	
    	this.setStandardUniforms(programObject, sources.uniforms);
    	programObject.changes = [];
    	return programObject;
    };

    XML3DShaderManager.prototype.compileShader = function(type, shaderSource) {
    	var gl = this.gl;

    	var shd = gl.createShader(type);
    	gl.shaderSource(shd, shaderSource);
    	gl.compileShader(shd);

    	if (gl.getShaderParameter(shd, gl.COMPILE_STATUS) == 0) {
    		var errorString = "";
    		if (type == gl.VERTEX_SHADER)
    			errorString = "Vertex shader failed to compile: \n";
    		else
    			errorString = "Fragment shader failed to compile: \n";

    		errorString += gl.getShaderInfoLog(shd) + "\n--------\n";
    		XML3D.debug.logError(errorString);
    		gl.getError();

    		return null;
    	}

    	return shd;
    };


    XML3DShaderManager.prototype.recompileShader = function(shaderAdapter, lights) {
    	var shaderName = shaderAdapter.node.id;
    	var shader = this.shaders[shaderName];
    	if (shader) {
    		this.destroyShader(shader);
    		delete this.shaders[shaderName];
    		this.createShader(shaderAdapter, lights);
    	}
    };

    XML3DShaderManager.prototype.shaderDataChanged = function(adapter, attrName, newValue, textureName) {
    	var shader = this.shaders[adapter.node.id];

    	//Store the change, it will be applied the next time the shader is bound
    	if (attrName == "src") {
    		//A texture source was changed
    		if (textureName) {
    			var sampler = shader.samplers[textureName];
    			if (sampler)
    				shader.samplers[textureName] = this.replaceTexture(adapter, sampler);
    		} else
    			XML3D.debug.logError("Couldn't apply change because of a missing texture name");

    	} else {
    		if (attrName == "transparency")
    			shader.hasTransparency = newValue > 0;

    		shader.changes.push({
    			type : "uniform",
    			name : attrName,
    			newValue : newValue
    		});
    	}

    };


    XML3DShaderManager.prototype.setStandardUniforms = function(sp, uniformValueMap) {
    	var gl = this.gl;

    	for (var name in uniformValueMap) {
    	    var uniInfo = sp.uniforms[name];
    	    if (uniInfo)
    	        this.setUniform(gl, uniInfo, uniformValueMap[name]);
    	}
    };

    XML3DShaderManager.prototype.getShaderById = function(shaderId) {
    	var sp = this.shaders[shaderId];
    	if (!sp) {
    		var shaderAdapter = this.factory.getAdapter(document.getElementById(shaderId));
    		if (shaderAdapter) {
    			//This must be a shader we haven't created yet (maybe it was just added or
    			//was not assigned to a group until now
    			this.createShader(shaderAdapter, this.renderer.lights);
    			if (this.shaders[shaderId])
    				return this.shaders[shaderId];
    		}

    		XML3D.debug.logError("Could not find the shader [ "+shaderId+" ]");
    		sp = this.shaders["default"];
    	}
    	return sp;
    };

    XML3DShaderManager.prototype.setUniformVariables = function(shader, uniforms) {
    	this.bindShader(shader);

    	for (var name in uniforms) {
    		var u = uniforms[name];

    		if (u.value)
    			u = u.value;
    		if (u.clean)
    			continue;
    		if (u.length == 1)
    			u = u[0]; // Either a single float, int or bool

    		if (shader.uniforms[name]) {
    			this.setUniform(this.gl, shader.uniforms[name], u);
    		}
    	}

    };

    XML3DShaderManager.prototype.bindShader = function(shader) {
        var sp = (typeof shader == typeof "") ? this.getShaderById(shader) : shader;

        if (this.currentProgram != sp.handle) {
            this.currentProgram = sp.handle;
            this.gl.useProgram(sp.handle);
        }

        var samplers = sp.samplers;
    	for (var tex in samplers) {
    		this.bindTexture(samplers[tex]);
            if(tex == "specularTexture" && sp.uniforms.useSpecularTexture) {
                this.setUniform(this.gl, sp.uniforms.useSpecularTexture, 1);
            }
    	}
    };

    XML3DShaderManager.prototype.updateShader = function(sp) {
        this.bindShader(sp);
        //Apply any changes encountered since the last time this shader was rendered
        for (var i=0, l = sp.changes.length; i<l; i++) {
            var change = sp.changes[i];
            if (change.type == "uniform" && sp.uniforms[change.name]) {
                this.setUniform(this.gl, sp.uniforms[change.name], change.newValue);
            }
        }
        sp.changes = [];
    };

    XML3DShaderManager.prototype.unbindShader = function(shader) {
        // TODO: unbind samplers (if any)
    	var sp = (typeof shader == typeof "") ? this.getShaderById(shader) : shader;
    	var samplers = sp.samplers;
    	for (var tex in samplers) {
    		this.unbindTexture(samplers[tex]);
    	}

    	this.currentProgram = null;
    	this.gl.useProgram(null);
    };

    var rc = window.WebGLRenderingContext;
    XML3DShaderManager.prototype.setUniform = function(gl, u, value) {
    	switch (u.glType) {
            case rc.BOOL:
            case rc.INT:
            case rc.SAMPLER_2D:
                gl.uniform1i(u.location, value); break;

    		case 35671: 														//gl.BOOL_VEC2
    		case 35667:	gl.uniform2iv(u.location, value); break;				//gl.INT_VEC2

    		case 35672:															//gl.BOOL_VEC3
    		case 35668:	gl.uniform3iv(u.location, value); break;				//gl.INT_VEC3

    		case 35673:															//gl.BOOL_VEC4
    		case 35669:	gl.uniform4iv(u.location, value); break;				//gl.INT_VEC4

    		case 5126:	gl.uniform1f(u.location, value); break;					//gl.FLOAT
    		case 35664:	gl.uniform2fv(u.location, value); break;				//gl.FLOAT_VEC2
    		case 35665:	gl.uniform3fv(u.location, value); break;				//gl.FLOAT_VEC3
    		case 35666:	gl.uniform4fv(u.location, value); break;				//gl.FLOAT_VEC4

    		case 35674: gl.uniformMatrix2fv(u.location, gl.FALSE, value); break;//gl.FLOAT_MAT2
    		case 35675: gl.uniformMatrix3fv(u.location, gl.FALSE, value); break;//gl.FLOAT_MAT3
    		case 35676: gl.uniformMatrix4fv(u.location, gl.FALSE, value); break;//gl.FLOAT_MAT4

    		default:
    			XML3D.debug.logError("Unknown uniform type "+u.glType);
    			break;
    	}
    };

    XML3DShaderManager.prototype.setGLContext = function(gl) {
    	this.gl = gl;
    };

    XML3DShaderManager.prototype.destroyShader = function(shader) {
    	for (var tex in shader.samplers) {
    		this.destroyTexture(shader.samplers[tex]);
    	}

    	this.gl.deleteProgram(shader.handle);
    };

    XML3DShaderManager.prototype.createTextures = function(shader, shaderAdapter) {
    	var texUnit = 0;
    	var nameArray = [];

    	for (var name in shader.samplers) {
    		nameArray.push(name);
    	}
    	var dataTable = shaderAdapter.requestData(nameArray);

    	for (var name in shader.samplers) {
    	    var sampler = shader.samplers[name];
            var texture = dataTable[name];

            if (!texture) {
    			//XML3D.debug.logWarning("Can't find required texture with name='"+name+"'. Using default shader instead.");
    			sampler.info = new InvalidTexture();
    			continue;
    		}

    		var dtopt = dataTable[name].getValue();
    		this.createTexture(dtopt, sampler, texUnit);
    		texUnit++;
    	}

    	return true;
    };

    XML3DShaderManager.prototype.createTexture = function(dtopt, sampler, texUnit) {
    	if(dtopt.imageAdapter && dtopt.imageAdapter.getValue)
		{
		    var renderer = this.renderer;
		    sampler.info = new TextureInfo({
		        onload : function() {
		            renderer.requestRedraw.call(renderer, "Texture loaded");
		        }
		    });
		    sampler.info.createEmpty(this.gl, texUnit, dtopt.imageAdapter.getValue(sampler.info.setLoaded, sampler.info));
		    sampler.info.setOptions({
                isDepth          : false,
                minFilter        : dtopt.minFilter,
                magFilter        : dtopt.magFilter,
                wrapS            : dtopt.wrapS,
                wrapT            : dtopt.wrapT,
                generateMipmap   : dtopt.generateMipmap,
                flipY            : true,
                premultiplyAlpha : true
		    });
		} else {
		    sampler.info = new InvalidTexture();
		    XML3D.debug.logWarning("No image found for texture: " + sampler);
		}
    };

    XML3DShaderManager.prototype.replaceTexture = function(adapter, texture) {
    	this.destroyTexture(texture);
    	var dtable = adapter.requestData([texture.name]);
    	var dtopt = dtable[texture.name].getValue();

    	//FIX ME PLEASE
    	dtopt.imageAdapter.image = null;

    	this.createTexture(dtopt, texture, texture.texUnit);

    	return texture;

    };

    XML3DShaderManager.prototype.createTex2DFromData = function(internalFormat, width, height,
    		sourceFormat, sourceType, texels, opt) {
    	var gl = this.gl;
    	var info = {};
    	if (!texels) {
    		if (sourceType == gl.FLOAT) {
    			texels = new Float32Array(width * height * 4);
    		}
    		else {
    			texels = new Uint8Array(width * height * 4);
    		}
    	}

    	var handle = gl.createTexture();
    	gl.bindTexture(gl.TEXTURE_2D, handle);

    	//gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opt.wrapS);
    	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opt.wrapT);
    	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opt.minFilter);
    	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opt.magFilter);

    	gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, sourceFormat, sourceType, texels);

    	if (opt.isDepth) {
    		gl.texParameteri(gl.TEXTURE_2D, gl.DEPTH_TEXTURE_MODE,   opt.depthMode);
    		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, opt.depthCompareMode);
    		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, opt.depthCompareFunc);
    	}
    	if (opt.generateMipmap) {
    		gl.generateMipmap(gl.TEXTURE_2D);
    	}

    	gl.bindTexture(gl.TEXTURE_2D, null);

    	info.handle = handle;
    	info.options = opt;
    	info.status = TEXTURE_STATE.VALID;
    	info.glType = gl.TEXTURE_2D;
    	info.format = internalFormat;

    	return info;
    };

    XML3DShaderManager.prototype.createTex2DFromImage = function(info) {
    	var gl = this.gl;
    	var opt = info.options;
    	var image = info.image;

    	gl.bindTexture(gl.TEXTURE_2D, info.handle);

    	//gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opt.wrapS);
    	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opt.wrapT);
    	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opt.minFilter);
    	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opt.magFilter);

    	if (!this.isPowerOfTwo(image.width) || !this.isPowerOfTwo(image.height)) {
    	    // Scale up the texture to the next highest power of two dimensions.
    	    var canvas = document.createElement("canvas");
    	    canvas.width = this.nextHighestPowerOfTwo(image.width);
    	    canvas.height = this.nextHighestPowerOfTwo(image.height);
    	    var ctx = canvas.getContext("2d");
    	    ctx.drawImage(image, 0, 0, canvas.width, canvas.height); //stretch to fit
    	    //ctx.drawImage(image, 0, 0, image.width, image.height); //centered with transparent padding around edges
    	    image = canvas;
    	}

    	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    	if (opt.generateMipmap) {
    		gl.generateMipmap(gl.TEXTURE_2D);
    	}

    	gl.bindTexture(gl.TEXTURE_2D, null);

    	info.status = TEXTURE_STATE.VALID;
    	info.glType = gl.TEXTURE_2D;
    	info.format = gl.RGBA;

    	return info;
    };

    XML3DShaderManager.prototype.bindTexture = function(tex) {
    	var info = tex.info;
    	var gl = this.gl;

    	switch(info.status) {
    	    case TEXTURE_STATE.VALID:
                gl.activeTexture(gl.TEXTURE0 + info.unit + 1);
                gl.bindTexture(info.glType, info.handle);
                // Should not be here, since the texunit is static
                this.setUniform(gl, tex, info.unit+1);
                break;
    	    case TEXTURE_STATE.LOADED:
                //console.dir("Creating '"+ tex.name + "' from " + info.image.src);
                //console.dir(info);
    	        this.createTex2DFromImage(info);
    	        this.bindTexture(tex);
    	        break;
    	    case TEXTURE_STATE.UNLOADED:
    	        gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, null);
                this.setUniform(gl, tex, 0);
    	};
    };

    XML3DShaderManager.prototype.unbindTexture = function(tex) {
        this.gl.activeTexture(this.gl.TEXTURE1 + tex.info.unit);
        this.gl.bindTexture(tex.info.glType, null);
    };

    XML3DShaderManager.prototype.destroyTexture = function(tex) {
    	if (tex.info && tex.info.handle)
    		this.gl.deleteTexture(tex.info.handle);
    };

    XML3DShaderManager.prototype.isPowerOfTwo = function(dimension) {
        return (dimension & (dimension - 1)) == 0;
    };

    XML3DShaderManager.prototype.nextHighestPowerOfTwo = function(x) {
        --x;
        for (var i = 1; i < 32; i <<= 1) {
            x = x | x >> i;
        }
        return x + 1;
    };
    XML3D.webgl.XML3DShaderManager = XML3DShaderManager;
}());