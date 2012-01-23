QUnit.extend( QUnit, {

	/** Small helper function for not having to manually compare vectors
	 *  all the time.
	 */
	__passesVector : function(actual, expected, maxDifference) {

		return (Math.abs(actual.x - expected.x) <= maxDifference &&
				Math.abs(actual.y - expected.y) <= maxDifference &&
				Math.abs(actual.z - expected.z) <= maxDifference);
	},

	closeVector : function(actual, expected, maxDifference, message) {
		var passes = (actual === expected) ||
			QUnit.__passesVector(actual, expected, maxDifference);
		QUnit.push(passes, actual, expected, message);
	},
	
	closeRotation : function(actual, expected, maxDifference, message) {
		var passes = (actual === expected) || 
			QUnit.__passesVector(actual.axis, expected.axis, maxDifference) &&
			(Math.abs(actual.angle - expected.angle) <= maxDifference);
		QUnit.push(passes, actual, expected, message);
	},
	
	closeMatrix  : function(actual, expected, maxDifference, message) {
	    if(!actual || !expected) {
	        QUnit.push(actual === expected, actual, expected, message);
	        return;
	    }

		var passes = 
			Math.abs(actual.m11 - expected.m11) <= maxDifference &&
			Math.abs(actual.m12 - expected.m12) <= maxDifference &&
			Math.abs(actual.m13 - expected.m13) <= maxDifference &&
			Math.abs(actual.m14 - expected.m14) <= maxDifference &&
			Math.abs(actual.m21 - expected.m21) <= maxDifference &&
			Math.abs(actual.m22 - expected.m22) <= maxDifference &&
			Math.abs(actual.m23 - expected.m23) <= maxDifference &&
			Math.abs(actual.m24 - expected.m24) <= maxDifference &&
			Math.abs(actual.m31 - expected.m31) <= maxDifference &&
			Math.abs(actual.m32 - expected.m32) <= maxDifference &&
			Math.abs(actual.m33 - expected.m33) <= maxDifference &&
			Math.abs(actual.m34 - expected.m34) <= maxDifference &&
			Math.abs(actual.m41 - expected.m41) <= maxDifference &&
			Math.abs(actual.m42 - expected.m42) <= maxDifference &&
			Math.abs(actual.m43 - expected.m43) <= maxDifference &&
			Math.abs(actual.m44 - expected.m44) <= maxDifference ;
		QUnit.push(passes, actual, expected, message);
	},

	closeRay : function(actual, expected, maxDifference, message) {
		var passes =
			QUnit.__passesVector(actual.origin, expected.origin, maxDifference) &&
			QUnit.__passesVector(actual.direction, expected.direction, maxDifference);
		QUnit.push(passes, actual, expected, message);
	},

	closeBox : function(actual, expected, maxDifference, message) {
		var passes =
			QUnit.__passesVector(actual.min, expected.min, maxDifference) &&
			QUnit.__passesVector(actual.max, expected.max, maxDifference);
		QUnit.push(passes, actual, expected, message);
	}
			
});
new (function() {

    function isVec3(arg) { return arg.toString() == '[object XML3DVec3]';};
    function isRotation(arg) { return arg.toString() == '[object XML3DRotation]';};
    function isMatrix(arg) {
        if (arg.toString() == '[object XML3DMatrix]')
            return true;
        if (window.WebKitCSSMatrix)
            return arg instanceof window.WebKitCSSMatrix;
        return false;
    };

    var original = QUnit.jsDump.parsers.object;
    QUnit.jsDump.setParser("object", function(a,b) {
        if(!a) return original(a,b);
        if(isVec3(a))
            return "XML3DVec("+a.x+", "+a.y+", "+a.z+")";
        if(isRotation(a))
            return "XML3DRotation("+a.axis.x+", "+a.axis.y+", "+a.axis.z+", "+ a.angle+")";
        if(isMatrix(a))
            return 'XML3DMatrix(\n' +
            a.m11 + ", " +  a.m12 + ", " +  a.m13 + ", " +  a.m14 + "\n" +
            a.m21 + ", " +  a.m22 + ", " +  a.m23 + ", " +  a.m24 + "\n" +
            a.m31 + ", " +  a.m32 + ", " +  a.m33 + ", " +  a.m34 + "\n" +
            a.m41 + ", " +  a.m42 + ", " +  a.m43 + ", " +  a.m44 + ")";
        return original(a,b);
    });
})();

var loadDocument = function(url, f) {
    var v = document.getElementById("xml3dframe");
    ok(v, "Found frame.");
    v.style.float = "right";
    v.style.width = "500px";
    v.style.height = "300px";
    v.addEventListener("load", f, true);
    v.src = url;
};