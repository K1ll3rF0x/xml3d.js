// Utility functions
(function() {

    var minmax = new Float32Array(6);

    xml3d.webgl.calculateBoundingBox = function(positions, index) {
        var bbox = new XML3DBox();

        if (!positions || positions.length < 3)
            return bbox;

        if (index) {
            var i0 = index[0]*3;
            minmax[0] = positions[i0];
            minmax[1] = positions[i0 + 1];
            minmax[2] = positions[i0 + 2];
            minmax[3] = positions[i0];
            minmax[4] = positions[i0 + 1];
            minmax[5] = positions[i0 + 2];

            for ( var i = 1; i < index.length; i++) {
                var i1 = index[i] * 3;
                var p1 = positions[i1];
                var p2 = positions[i1 + 1];
                var p3 = positions[i1 + 2];

                if (p1 < minmax[0])
                    minmax[0] = p1;
                if (p2 < minmax[1])
                    minmax[1] = p2;
                if (p3 < minmax[2])
                    minmax[2] = p3;
                if (p1 > minmax[3])
                    minmax[3] = p1;
                if (p2 > minmax[4])
                    minmax[4] = p2;
                if (p3 > minmax[5])
                    minmax[5] = p3;
            }
        } else {
            minmax[0] = positions[0];
            minmax[1] = positions[1];
            minmax[2] = positions[2];
            minmax[3] = positions[0];
            minmax[4] = positions[1];
            minmax[5] = positions[2];

            for ( var i = 3; i < positions.length; i += 3) {
                if (positions[i] < minmax[0])
                    minmax[0] = positions[i];
                if (positions[i + 1] < minmax[1])
                    minmax[1] = positions[i + 1];
                if (positions[i + 2] < minmax[2])
                    minmax[2] = positions[i + 2];
                if (positions[i] > minmax[3])
                    minmax[3] = positions[i];
                if (positions[i + 1] > minmax[4])
                    minmax[4] = positions[i + 1];
                if (positions[i + 2] > minmax[5])
                    minmax[5] = positions[i + 2];
            }
        }
        bbox.min.set(minmax[0], minmax[1], minmax[2]);
        bbox.max.set(minmax[3], minmax[4], minmax[5]);
        return bbox;
    };

    var absMat = mat4.create();

    xml3d.webgl.transformAABB = function(bbox, gmatrix) {
        if (bbox.isEmpty())
            return;

        var min = bbox.min._data;
        var max = bbox.max._data;

        var center = vec3.scale(vec3.add(min, max, vec3.create()), 0.5);
        var extend = vec3.scale(vec3.subtract(max, min, vec3.create()), 0.5);

        mat4.toRotationMat(gmatrix, absMat);
        for ( var i = 0; i < 16; i++) {
            absMat[i] = Math.abs(absMat[i]);
        }
        mat4.multiplyVec3(absMat, extend);
        mat4.multiplyVec3(gmatrix, center);

        vec3.add(center, extend, bbox.max._data);
        vec3.subtract(center, extend, bbox.min._data);
    };
    

    /**
     * Splits mesh data into smaller chunks. WebGL only supports 65,535 indices, meshes of greater size are
     * automatically split by this function. Supports splitting indices, positions, texcoords and colors. 
     * NOTE: The dataTable parameter is modified to hold the newly split mesh data.
     * 
     * @param dataTable the source data table to be split
     * @param maxIndexCount the desired chunk size
     * @return
     */
    xml3d.webgl.splitMesh = function(dataTable, maxIndexCount) {
    	var verticesPerPolygon = 3;
        var colorStride = 3;
    	maxIndexCount = Math.floor(maxIndexCount / 3) * 3;
    	
    	//See which data is in the supplied dataTable
    	var positionSource = dataTable.position.data;
    	var indexSource = dataTable.index ? dataTable.index.data : undefined;
    	var normalSource = dataTable.normal ? dataTable.normal.data : undefined;
    	var texcoordSource = dataTable.texcoord ? dataTable.texcoord.data : undefined;
    	var colorSource = dataTable.color ? dataTable.color.data : undefined;
    	
    	var vertexStride = dataTable.position.tupleSize;
    	var texcoordStride = dataTable.texcoord ? dataTable.texcoord.tupleSize : undefined;
    	var currentIndexSize = indexSource.length;
    	
    	if (indexSource) {
    		var boundaryList = [];
    		
    		var lastBinSize = currentIndexSize % maxIndexCount;
    		var numBins = Math.ceil(currentIndexSize / maxIndexCount);
    		var bins = new Array();
    		
    		//Create the bins
    		for (var i = 0; i < numBins; i++) {
    			bins[i] = {};
    			bins[i].index = new Uint16Array(maxIndexCount);
    			bins[i].index.nextFreeSlot = 0;
    			bins[i].position = new Float32Array(maxIndexCount*vertexStride);
    			
    			if (normalSource)
    				bins[i].normal = new Float32Array(maxIndexCount*vertexStride);
    			if (texcoordSource)
    				bins[i].texcoord = new Float32Array(maxIndexCount*texcoordStride);
    			if (colorSource)
    				bins[i].color = new Float32Array(maxIndexCount*colorStride);
    		}
    		
    		//Iterate over the index buffer and sort the polygons into bins
    		for (var i = 0; i < indexSource.length; i += verticesPerPolygon) {
    			var consistentBin = true;
    			var targetBin = Math.floor(indexSource[i] / maxIndexCount);
    			
    			if (bins[targetBin].index.nextFreeSlot + verticesPerPolygon > maxIndexCount) 
    				consistentBin = false;

    			//See if this polygon spans more than one bin
    			for (j = 1; j < verticesPerPolygon; j++) {
    				if (Math.floor(indexSource[i + j] / maxIndexCount) != targetBin) {
    					consistentBin = false;
    					break;
    				}
    			}
    			
    			//We need to place this polygon in a separate pass
    			if (!consistentBin) {
    				boundaryList.push(i);
    				continue;
    			}
    			
    			var indexTransform = maxIndexCount * targetBin;
    			
    			//Distribute the indices and vertex data into the appropriate bin
    			for (var j = 0; j < verticesPerPolygon; j++) {
    				var oldIndex = indexSource[i+j];
    				var newIndex = oldIndex - indexTransform;
    				
    				var bin = bins[targetBin];
    				bin.index[bin.index.nextFreeSlot] = newIndex;
    				bin.index.nextFreeSlot++;
    				
    				var vertIndex = oldIndex * vertexStride;
    				var position = [];
    				for (var k = 0; k < vertexStride; k++) {
    					position[k] = positionSource[vertIndex+k];
    				}			
    				bin.position.set(position, newIndex*vertexStride);
    				
    				if(normalSource) {
    					var normal = [];
    					for (var k = 0; k < vertexStride; k++) {
    						normal[k] = normalSource[vertIndex+k];
    					}			
    					bin.normal.set(normal, newIndex*vertexStride);
    				}
    				
    				var texIndex = oldIndex * texcoordStride;
    				if (texcoordSource) {
    					var texcoord = [];
    					for (var k = 0; k < texcoordStride; k++) {
    						texcoord[k] = texcoordSource[texIndex+k];
    					}			
    					bin.texcoord.set(texcoord, newIndex*texcoordStride);
    				}
    				
    				if(colorSource) {
    					var color = [];
    					for (var k = 0; k < colorStride; k++) {
    						color[k] = colorSource[vertIndex+k];
    					}			
    					bin.color.set(color, newIndex*colorStride);
    				}
    				
    			}
    		}
    		
    		//Insert boundary items into bins
    		var targetBin = 0;
    		for (var i = 0; i < boundaryList.length; i++) {
    			while(bins[targetBin].index.nextFreeSlot + verticesPerPolygon > maxIndexCount) {
    				targetBin++;
    				if (targetBin >= bins.length) {
    					//We need to create a new bin
    					bins[targetBin] = {};
    					bins[targetBin].index = new Uint16Array(maxIndexCount);
    					bins[targetBin].index.nextFreeSlot = 0;
    					bins[targetBin].position = new Float32Array(maxIndexCount*vertexStride);
    					
    					if (normalSource)
    						bins[targetBin].normal = new Float32Array(maxIndexCount*vertexStride);
    					if (texcoordSource)
    						bins[targetBin].texcoord = new Float32Array(maxIndexCount*texcoordStride);
    					if (colorSource)
    						bins[targetBin].color = new Float32Array(maxIndexCount*colorStride);
    					break;
    				}
    			}
    			
    			//Distribute polygon into the appropriate bin
    			for (var j = 0; j < verticesPerPolygon; j++) {
    				var bin = bins[targetBin];
    				
    				var oldIndex = indexSource[boundaryList[i] + j];
    				var newIndex = bin.index.nextFreeSlot;
    				
    				bin.index[newIndex] = newIndex;
    				bin.index.nextFreeSlot++;
    				
    				var position = [];
    				for (var k = 0; k < vertexStride; k++) {
    					position[k] = positionSource[oldIndex*vertexStride+k];
    				}			
    				bin.position.set(position, newIndex*vertexStride);
    				
    				if(normalSource) {
    					var normal = [];
    					for (var k = 0; k < vertexStride; k++) {
    						normal[k] = normalSource[oldIndex*vertexStride+k];
    					}			
    					bin.normal.set(normal, newIndex*vertexStride);
    				}
    				
    				if (texcoordSource) {
    					var texcoord = [];
    					for (var k = 0; k < texcoordStride; k++) {
    						texcoord[k] = texcoordSource[oldIndex*texcoordStride+k];
    					}			
    					bin.texcoord.set(texcoord, newIndex*vertexStride);
    				}
    				
    				if(colorSource) {
    					var color = [];
    					for (var k = 0; k < vertexStride; k++) {
    						color[k] = colorSource[oldIndex*colorStride+k];
    					}			
    					bin.color.set(color, newIndex*colorStride);
    				}
    				
    			}
    		}
    	
    		//Prepare dataTable for the split mesh data
    		dataTable.index = [];
    		dataTable.position = [];
    		if (normalSource)
    			dataTable.normal = [];
    		if (texcoordSource)
    			dataTable.texcoord = [];
    		if (colorSource)
    			dataTable.color = [];
    		
    		//Populate the dataTable with the bins
    		for (var i = 0; i < bins.length; i++) {
    			dataTable.index[i] = { data : bins[i].index, tupleSize : vertexStride };
    			dataTable.position[i] = { data : bins[i].position, tupleSize : vertexStride };
    			if (normalSource)
    				dataTable.normal[i] = { data : bins[i].normal, tupleSize : vertexStride };
    			if (texcoordSource)
    				dataTable.position[i] = { data : bins[i].texcoord, tupleSize : texcoordStride };
    			if (colorSource)
    				dataTable.color[i] = { data : bins[i].color, tupleSize : colorStride };
    		}
    		
    	}
    	
    	
    };

})();