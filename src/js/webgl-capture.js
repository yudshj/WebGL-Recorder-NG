const HydArrayBuffer = ArrayBuffer;
const HydFloat32Array = Float32Array;
const HydFloat64Array = Float64Array;
const HydHTMLCanvasElement = HTMLCanvasElement;
const HydHTMLImageElement = HTMLImageElement;
const HydHTMLVideoElement = HTMLVideoElement;
const HydImage = Image;
const HydImageBitmap = ImageBitmap;
const HydImageData = ImageData;
const HydInt16Array = Int16Array;
const HydInt32Array = Int32Array;
const HydInt8Array = Int8Array;
const HydOffscreenCanvas = OffscreenCanvas;
const HydUint16Array = Uint16Array;
const HydUint32Array = Uint32Array;
const HydUint8Array = Uint8Array;
const HydUint8ClampedArray = Uint8ClampedArray;
// const HydSharedArrayBuffer = SharedArrayBuffer;
const HydDataView = DataView;
const HydMaxSerializeSize = 256 * 1024 * 1024;
const HydMaxArraySize = 16 * 1024 * 1024;
let HydAllSerialized = true;

/* global WebGLObject */
const HydWebGLCapture = (function () {

  function hydArrayToBinaryString(compressed, chunkSize = 1024) {
    let binaryStrings = [];

    for (let i = 0; i < compressed.length; i += chunkSize) {
      const chunk = compressed.subarray(i, i + chunkSize);
      binaryStrings.push(String.fromCharCode.apply(null, chunk));
    }

    return binaryStrings.join('');
  }

  const getResourceName = function (resource) {
    if (resource) {
      const info = resource.__capture_info__;
      return `${info.type}[${info.id}]`;
    }
    return 'null';
  };

  const glEnums = {};

  function glEnumToString(value) {
    return glEnums[value];
  }

  /**
   * Types of contexts we have added to map
   */
  const mappedContextTypes = {};

  /**
   * Map of names to numbers.
   * @type {Object}
   */
  const enumStringToValue = {};

  /**
   * Initializes this module. Safe to call more than once.
   * @param {!WebGLRenderingContext} ctx A WebGL context. If
   *    you have more than one context it doesn't matter which one
   *    you pass in, it is only used to pull out constants.
   */
  function addEnumsForContext(ctx, type) {
    if (!mappedContextTypes[type]) {
      mappedContextTypes[type] = true;
      for (const propertyName in ctx) {
        if (typeof ctx[propertyName] === 'number') {
          //glEnums[ctx[propertyName]] = propertyName;
          enumStringToValue[propertyName] = ctx[propertyName];
        }
      }
    }
  }

  function enumArrayToString(gl, enums) {
    const enumStrings = [];
    if (enums.length) {
      for (let i = 0; i < enums.length; ++i) {
        enums.push(glEnumToString(enums[i]));  // eslint-disable-line
      }
      return `[${enumStrings.join(', ')}]`;
    }
    return enumStrings.toString();
  }

  function makeBitFieldToStringFunc(enums) {
    return function (gl, value) {
      let orResult = 0;
      const orEnums = ['0'];
      for (let i = 0; i < enums.length; ++i) {
        const enumValue = enumStringToValue[enums[i]];
        if ((value & enumValue) !== 0) {
          orResult |= enumValue;
          orEnums.push(glEnumToString(enumValue));  // eslint-disable-line
        }
      }
      if (orResult === value) {
        return orEnums.join(' | ');
      } else {
        return glEnumToString(value);  // eslint-disable-line
      }
    };
  }

  const destBufferBitFieldToString = makeBitFieldToStringFunc([
    'COLOR_BUFFER_BIT',
    'DEPTH_BUFFER_BIT',
    'STENCIL_BUFFER_BIT',
  ]);

  function convertToObjectIfArray(obj, key) {
    if (Array.isArray(obj[key])) {
      obj[key] = Object.fromEntries(obj[key].map(ndx => [Math.abs(ndx), ndx]));
    }
  }

  function checkArrayForUniform(length) { return (args) => [0, length * 4, args]; }
  function checkArrayForUniformWithOffset(offset, length) { return (args) => [args[offset], length * 4, args.slice(0, -1)]; }
  function checkArrayForUniformWithOffsetAndLength(offset, length) { return (args) => [args[offset], length * 4, args.slice(0, -2)]; }
  // function checkArrayForUniformWithOffsetAndLength(offset, length) { return (args) => [args[offset], args[length], args.slice(0, -2)]; }
  function checkTypedArrayWithOffset(offset) { return (args) => [args[offset], undefined, args.slice(0, -1)]; }
  function checkTypedArrayWithOffsetAndLength(offset, length) { return (args) => [args[offset], args[length], args.slice(0, -2)]; }
  // function checkOptionalTypedArrayWithOffset(offset) { return (args) => [args[offset], undefined, args.slice(0, -1)]; }
  function checkBufferSourceWithOffset(offset) { return (args) => [args[offset], undefined, args.slice(0, -1)]; }
  function checkBufferSourceWithOffsetAndLength(offset, length) { return (args) => [args[offset], args[length], args.slice(0, -2)]; }
  function getUniformNameErrorMsg() { }

  /**
   * Info about functions based on the number of arguments to the function.
   *
   * enums specifies which arguments are enums
   *
   *    'texImage2D': {
   *       9: { enums: [0, 2, 6, 7 ] },
   *       6: { enums: [0, 2, 3, 4 ] },
   *    },
   *
   * means if there are 9 arguments then 6 and 7 are enums, if there are 6
   * arguments 3 and 4 are enums. You can provide a function instead in
   * which case you should use object format. For example
   *
   *     `clear`: {
   *       1: { enums: { 0: convertClearBitsToString }},
   *     },
   *
   * `numbers` specifies which arguments are numbers, if an argument is negative that
   * argument might not be a number so we can check only check for NaN
   * arrays specifies which arguments are arrays
   *
   * `read` specifies which arguments are typedarrays for reading so no need
   * to emit the content of the array.
   *
   * @type {!Object.<number, (!Object.<number, string>|function)}
   */
  const glFunctionInfos = {
    // Generic setters and getters

    'enable': { 1: { enums: [0] } },
    'disable': { 1: { enums: [0] } },
    'getParameter': { 1: { enums: [0] } },

    // Rendering

    'drawArrays': { 3: { enums: [0], numbers: [1, 2] } },
    'drawElements': { 4: { enums: [0, 2], numbers: [1, 3] } },
    'drawArraysInstanced': { 4: { enums: [0], numbers: [1, 2, 3] } },
    'drawElementsInstanced': { 5: { enums: [0, 2], numbers: [1, 3, 4] } },
    'drawRangeElements': { 6: { enums: [0, 4], numbers: [1, 2, 3, 5] } },

    // Shaders

    'createShader': { 1: { enums: [0] } },
    'getActiveAttrib': { 2: { numbers: [1] } },
    'getActiveUniform': { 2: { numbers: [1] } },
    'getShaderParameter': { 2: { enums: [1] } },
    'getProgramParameter': { 2: { enums: [1] } },
    'getShaderPrecisionFormat': { 2: { enums: [0, 1] } },
    'bindAttribLocation': { 3: { numbers: [1] } },

    // Vertex attributes

    'getVertexAttrib': { 2: { enums: [1], numbers: [0] } },
    'vertexAttribPointer': { 6: { enums: [2], numbers: [0, 1, 4, 5] } },
    'vertexAttribIPointer': { 5: { enums: [2], numbers: [0, 1, 3, 4] } },  // WebGL2
    'vertexAttribDivisor': { 2: { numbers: [0, 1] } }, // WebGL2
    'disableVertexAttribArray': { 1: { numbers: [0] } },
    'enableVertexAttribArray': { 1: { numbers: [0] } },

    // Textures

    'bindTexture': { 2: { enums: [0] } },
    'activeTexture': { 1: { enums: [0, 1] } },
    'getTexParameter': { 2: { enums: [0, 1] } },
    'texParameterf': { 3: { enums: [0, 1], numbers: [2] } },
    'texParameteri': { 3: { enums: [0, 1], numbers: [2] } },
    'texImage2D': {
      6: { enums: [0, 2, 3, 4], numbers: [1] },
      9: { enums: [0, 2, 6, 7], numbers: [1, 3, 4, 5] },
      10: { enums: [0, 2, 6, 7], numbers: [1, 3, 4, 5, 9], arrays: { 8: checkTypedArrayWithOffset(9) }, }, // WebGL2
    },
    'texImage3D': {
      10: { enums: [0, 2, 7, 8], numbers: [1, 3, 4, 5] },  // WebGL2
      11: { enums: [0, 2, 7, 8], numbers: [1, 3, 4, 5, 10], arrays: { 9: checkTypedArrayWithOffset(10) } },  // WebGL2
    },
    'texSubImage2D': {
      9: { enums: [0, 6, 7], numbers: [1, 2, 3, 4, 5] },
      7: { enums: [0, 4, 5], numbers: [1, 2, 3] },
      10: { enums: [0, 6, 7], numbers: [1, 2, 3, 4, 5, 9], arrays: { 8: checkTypedArrayWithOffset(9) } },  // WebGL2
    },
    'texSubImage3D': {
      11: { enums: [0, 8, 9], numbers: [1, 2, 3, 4, 5, 6, 7] },  // WebGL2
      12: { enums: [0, 8, 9], numbers: [1, 2, 3, 4, 5, 6, 7, 11], arrays: { 10: checkTypedArrayWithOffset(11) } },  // WebGL2
    },
    'texStorage2D': { 5: { enums: [0, 2], numbers: [1, 3, 4] } },  // WebGL2
    'texStorage3D': { 6: { enums: [0, 2], numbers: [1, 3, 4, 6] } },  // WebGL2
    'copyTexImage2D': { 8: { enums: [0, 2], numbers: [1, 3, 4, 5, 6, 7] } },
    'copyTexSubImage2D': { 8: { enums: [0], numbers: [1, 2, 3, 4, 5, 6, 7] } },
    'copyTexSubImage3D': { 9: { enums: [0], numbers: [1, 2, 3, 4, 5, 6, 7, 8] } },  // WebGL2
    'generateMipmap': { 1: { enums: [0] } },
    'compressedTexImage2D': {
      7: { enums: [0, 2], numbers: [1, 3, 4, 5] },
      8: { enums: [0, 2], numbers: [1, 3, 4, 5, 7], arrays: { 6: checkTypedArrayWithOffset(7) } },  // WebGL2
      9: { enums: [0, 2], numbers: [1, 3, 4, 5, 7, 8], arrays: { 6: checkTypedArrayWithOffsetAndLength(7, 8) } },  // WebGL2
    },
    'compressedTexSubImage2D': {
      8: { enums: [0, 6], numbers: [1, 2, 3, 4, 5] },
      9: { enums: [0, 6], numbers: [1, 2, 3, 4, 5, 8], arrays: { 7: checkTypedArrayWithOffset(8) } },  // WebGL2
      10: { enums: [0, 6], numbers: [1, 2, 3, 4, 5, 8, 9], arrays: { 7: checkTypedArrayWithOffsetAndLength(8, 9) } },  // WebGL2
    },
    'compressedTexImage3D': {
      8: { enums: [0, 2], numbers: [1, 3, 4, 5, 6] },  // WebGL2
      9: { enums: [0, 2], numbers: [1, 3, 4, 5, 6, 8], arrays: { 7: checkTypedArrayWithOffset(8) } },  // WebGL2
      10: { enums: [0, 2], numbers: [1, 3, 4, 5, 6, 8, 9], arrays: { 7: checkTypedArrayWithOffsetAndLength(8, 9) } },  // WebGL2
    },
    'compressedTexSubImage3D': {
      10: { enums: [0, 8], numbers: [1, 2, 3, 4, 5, 6, 7] },  // WebGL2
      11: { enums: [0, 8], numbers: [1, 2, 3, 4, 5, 6, 7, 10], arrays: { 9: checkTypedArrayWithOffset(10) } },  // WebGL2
      12: { enums: [0, 8], numbers: [1, 2, 3, 4, 5, 6, 7, 10, 11], arrays: { 9: checkTypedArrayWithOffsetAndLength(10, 11) } },  // WebGL2
    },

    // Buffer objects

    'bindBuffer': { 2: { enums: [0] } },
    'bufferData': {
      3: { enums: [0, 2] },
      4: { enums: [0, 2], numbers: [3], arrays: { 1: checkBufferSourceWithOffset(3) } },  // WebGL2
      5: { enums: [0, 2], numbers: [3, 4], arrays: { 1: checkBufferSourceWithOffsetAndLength(3, 4) } },  // WebGL2
    },
    'bufferSubData': {
      3: { enums: [0], numbers: [1] },
      4: { enums: [0], numbers: [1, 3], arrays: { 2: checkBufferSourceWithOffset(3) } },  // WebGL2
      5: { enums: [0], numbers: [1, 3, 4], arrays: { 2: checkBufferSourceWithOffsetAndLength(3, 4) } },  // WebGL2
    },
    'copyBufferSubData': {
      5: { enums: [0, 1], numbers: [2, 3, 4] },  // WebGL2
    },
    'getBufferParameter': { 2: { enums: [0, 1] } },
    'getBufferSubData': {
      3: { enums: [0], numbers: [1], read: [2] },  // WebGL2
      4: { enums: [0], numbers: [1, 3], read: [2], },  // WebGL2
      5: { enums: [0], numbers: [1, 3, 4], read: [2], },  // WebGL2
    },

    // Renderbuffers and framebuffers

    'pixelStorei': { 2: { enums: [0, 1], numbers: [1] } },
    'readPixels': {
      7: { enums: [4, 5], numbers: [0, 1, 2, 3, -6], read: [6] },
      8: { enums: [4, 5], numbers: [0, 1, 2, 3, 7], read: [6] },  // WebGL2
    },
    'bindRenderbuffer': { 2: { enums: [0] } },
    'bindFramebuffer': { 2: { enums: [0] } },
    'blitFramebuffer': { 10: { enums: { 8: destBufferBitFieldToString, 9: true }, numbers: [0, 1, 2, 3, 4, 5, 6, 7] } },  // WebGL2
    'checkFramebufferStatus': { 1: { enums: [0] } },
    'framebufferRenderbuffer': { 4: { enums: [0, 1, 2], } },
    'framebufferTexture2D': { 5: { enums: [0, 1, 2], numbers: [4] } },
    'framebufferTextureLayer': { 5: { enums: [0, 1], numbers: [3, 4] } },  // WebGL2
    'getFramebufferAttachmentParameter': { 3: { enums: [0, 1, 2] } },
    'getInternalformatParameter': { 3: { enums: [0, 1, 2] } },  // WebGL2
    'getRenderbufferParameter': { 2: { enums: [0, 1] } },
    'invalidateFramebuffer': { 2: { enums: { 0: true, 1: enumArrayToString, } } },  // WebGL2
    'invalidateSubFramebuffer': { 6: { enums: { 0: true, 1: enumArrayToString, }, numbers: [2, 3, 4, 5] } },  // WebGL2
    'readBuffer': { 1: { enums: [0] } },  // WebGL2
    'renderbufferStorage': { 4: { enums: [0, 1], numbers: [2, 3] } },
    'renderbufferStorageMultisample': { 5: { enums: [0, 2], numbers: [1, 3, 4] } },  // WebGL2

    // Frame buffer operations (clear, blend, depth test, stencil)

    'lineWidth': { 1: { numbers: [0] } },
    'polygonOffset': { 2: { numbers: [0, 1] } },
    'scissor': { 4: { numbers: [0, 1, 2, 3] } },
    'viewport': { 4: { numbers: [0, 1, 2, 3] } },
    'clear': { 1: { enums: { 0: destBufferBitFieldToString } } },
    'clearColor': { 4: { numbers: [0, 1, 2, 3] } },
    'clearDepth': { 1: { numbers: [0] } },
    'clearStencil': { 1: { numbers: [0] } },
    'depthFunc': { 1: { enums: [0] } },
    'depthRange': { 2: { numbers: [0, 1] } },
    'blendColor': { 4: { numbers: [0, 1, 2, 3] } },
    'blendFunc': { 2: { enums: [0, 1] } },
    'blendFuncSeparate': { 4: { enums: [0, 1, 2, 3] } },
    'blendEquation': { 1: { enums: [0] } },
    'blendEquationSeparate': { 2: { enums: [0, 1] } },
    'stencilFunc': { 3: { enums: [0], numbers: [1, 2] } },
    'stencilFuncSeparate': { 4: { enums: [0, 1], numbers: [2, 3] } },
    'stencilMask': { 1: { numbers: [0] } },
    'stencilMaskSeparate': { 2: { enums: [0], numbers: [1] } },
    'stencilOp': { 3: { enums: [0, 1, 2] } },
    'stencilOpSeparate': { 4: { enums: [0, 1, 2, 3] } },

    // Culling

    'cullFace': { 1: { enums: [0] } },
    'frontFace': { 1: { enums: [0] } },

    // ANGLE_instanced_arrays extension

    'drawArraysInstancedANGLE': { 4: { enums: [0], numbers: [1, 2, 3] } },
    'drawElementsInstancedANGLE': { 5: { enums: [0, 2], numbers: [1, 3, 4] } },

    // EXT_blend_minmax extension

    'blendEquationEXT': { 1: { enums: [0] } },

    // Multiple Render Targets

    'drawBuffersWebGL': { 1: { enums: { 0: enumArrayToString, } } },  // WEBGL_draw_buffers
    'drawBuffers': { 1: { enums: { 0: enumArrayToString, } } },  // WebGL2
    'clearBufferfv': {
      3: { enums: [0], numbers: [1] },  // WebGL2
      4: { enums: [0], numbers: [1, 2] },  // WebGL2
    },
    'clearBufferiv': {
      3: { enums: [0], numbers: [1] },  // WebGL2
      4: { enums: [0], numbers: [1, 2] },  // WebGL2
    },
    'clearBufferuiv': {
      3: { enums: [0], numbers: [1] },  // WebGL2
      4: { enums: [0], numbers: [1, 2] },  // WebGL2
    },
    'clearBufferfi': { 4: { enums: [0], numbers: [1, 2, 3] } },  // WebGL2

    // uniform value setters
    'uniform1f': { 2: { numbers: [1] } },
    'uniform2f': { 3: { numbers: [1, 2] } },
    'uniform3f': { 4: { numbers: [1, 2, 3] } },
    'uniform4f': { 5: { numbers: [1, 2, 3, 4] } },

    'uniform1i': { 2: { numbers: [1] } },
    'uniform2i': { 3: { numbers: [1, 2] } },
    'uniform3i': { 4: { numbers: [1, 2, 3] } },
    'uniform4i': { 5: { numbers: [1, 2, 3, 4] } },

    'uniform1fv': {
      2: { arrays: { 1: checkArrayForUniform(1) } },
      3: { arrays: { 1: checkArrayForUniformWithOffset(2, 1) }, numbers: [2] },
      4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 1) }, numbers: [2] },
      // 4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 3) }, numbers: [2, 3] },
    },
    'uniform2fv': {
      2: { arrays: { 1: checkArrayForUniform(2) } },
      3: { arrays: { 1: checkArrayForUniformWithOffset(2, 2) }, numbers: [2] },
      4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 2) }, numbers: [2] },
      // 4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 3) }, numbers: [2, 3] },
    },
    'uniform3fv': {
      2: { arrays: { 1: checkArrayForUniform(3) } },
      3: { arrays: { 1: checkArrayForUniformWithOffset(2, 3) }, numbers: [2] },
      4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 3) }, numbers: [2] },
      // 4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 3) }, numbers: [2, 3] },
    },
    'uniform4fv': {
      2: { arrays: { 1: checkArrayForUniform(4) } },
      3: { arrays: { 1: checkArrayForUniformWithOffset(2, 4) }, numbers: [2] },
      4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 4) }, numbers: [2] },
      // 4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 3) }, numbers: [2, 3] },
    },

    'uniform1iv': {
      2: { arrays: { 1: checkArrayForUniform(1) } },
      3: { arrays: { 1: checkArrayForUniformWithOffset(2, 1) }, numbers: [2] },
      4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 1) }, numbers: [2] },
      // 4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 3) }, numbers: [2, 3] },
    },
    'uniform2iv': {
      2: { arrays: { 1: checkArrayForUniform(2) } },
      3: { arrays: { 1: checkArrayForUniformWithOffset(2, 2) }, numbers: [2] },
      4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 2) }, numbers: [2] },
      // 4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 3) }, numbers: [2, 3] },
    },
    'uniform3iv': {
      2: { arrays: { 1: checkArrayForUniform(3) } },
      3: { arrays: { 1: checkArrayForUniformWithOffset(2, 3) }, numbers: [2] },
      4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 3) }, numbers: [2] },
      // 4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 3) }, numbers: [2, 3] },
    },
    'uniform4iv': {
      2: { arrays: { 1: checkArrayForUniform(4) } },
      3: { arrays: { 1: checkArrayForUniformWithOffset(2, 4) }, numbers: [2] },
      4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 4) }, numbers: [2] },
      // 4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 3) }, numbers: [2, 3] },
    },

    'uniformMatrix2fv': {
      3: { arrays: { 2: checkArrayForUniform(4) } },
      4: { arrays: { 2: checkArrayForUniformWithOffset(3, 4) }, numbers: [3] },
      5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 4) }, numbers: [3] },
      // 5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 4) }, numbers: [3, 4] },
    },
    'uniformMatrix3fv': {
      3: { arrays: { 2: checkArrayForUniform(9) } },
      4: { arrays: { 2: checkArrayForUniformWithOffset(3, 9) }, numbers: [3] },
      5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 9) }, numbers: [3] },
      // 5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 4) }, numbers: [3, 4] },
    },
    'uniformMatrix4fv': {
      3: { arrays: { 2: checkArrayForUniform(16) } },
      4: { arrays: { 2: checkArrayForUniformWithOffset(3, 16) }, numbers: [3] },
      5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 16) }, numbers: [3] },
      // 5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 4) }, numbers: [3, 4] },
    },

    'uniform1ui': { 2: { numbers: [1] } },  // WebGL2
    'uniform2ui': { 3: { numbers: [1, 2] } },  // WebGL2
    'uniform3ui': { 4: { numbers: [1, 2, 3] } },  // WebGL2
    'uniform4ui': { 5: { numbers: [1, 2, 3, 4] } },  // WebGL2

    'uniform1uiv': {  // WebGL2
      2: { arrays: { 1: checkArrayForUniform(1) }, },
      3: { arrays: { 1: checkArrayForUniformWithOffset(2, 1) }, numbers: [2] },
      4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 1) }, numbers: [2] },
      // 4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 3) }, numbers: [2, 3] },
    },
    'uniform2uiv': {  // WebGL2
      2: { arrays: { 1: checkArrayForUniform(2) }, },
      3: { arrays: { 1: checkArrayForUniformWithOffset(2, 2) }, numbers: [2] },
      4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 2) }, numbers: [2] },
      // 4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 3) }, numbers: [2, 3] },
    },
    'uniform3uiv': {  // WebGL2
      2: { arrays: { 1: checkArrayForUniform(3) }, },
      3: { arrays: { 1: checkArrayForUniformWithOffset(2, 3) }, numbers: [2] },
      4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 3) }, numbers: [2] },
      // 4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 3) }, numbers: [2, 3] },
    },
    'uniform4uiv': {  // WebGL2
      2: { arrays: { 1: checkArrayForUniform(4) }, },
      3: { arrays: { 1: checkArrayForUniformWithOffset(2, 4) }, numbers: [2] },
      4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 4) }, numbers: [2] },
      // 4: { arrays: { 1: checkArrayForUniformWithOffsetAndLength(2, 3) }, numbers: [2, 3] },
    },
    'uniformMatrix3x2fv': {  // WebGL2
      3: { arrays: { 2: checkArrayForUniform(6) }, },
      4: { arrays: { 2: checkArrayForUniformWithOffset(3, 6) }, numbers: [3] },
      5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 6) }, numbers: [3] },
      // 5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 4) }, numbers: [3, 4] },
    },
    'uniformMatrix4x2fv': {  // WebGL2
      3: { arrays: { 2: checkArrayForUniform(8) }, },
      4: { arrays: { 2: checkArrayForUniformWithOffset(3, 8) }, numbers: [3] },
      5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 8) }, numbers: [3] },
      // 5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 4) }, numbers: [3, 4] },
    },

    'uniformMatrix2x3fv': {  // WebGL2
      3: { arrays: { 2: checkArrayForUniform(6) }, },
      4: { arrays: { 2: checkArrayForUniformWithOffset(3, 6) }, numbers: [3] },
      5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 6) }, numbers: [3] },
      // 5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 4) }, numbers: [3, 4] },
    },
    'uniformMatrix4x3fv': {  // WebGL2
      3: { arrays: { 2: checkArrayForUniform(12) }, },
      4: { arrays: { 2: checkArrayForUniformWithOffset(3, 12) }, numbers: [3] },
      5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 12) }, numbers: [3] },
      // 5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 4) }, numbers: [3, 4] },
    },

    'uniformMatrix2x4fv': {  // WebGL2
      3: { arrays: { 2: checkArrayForUniform(8) }, },
      4: { arrays: { 2: checkArrayForUniformWithOffset(3, 8) }, numbers: [3] },
      5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 8) }, numbers: [3] },
      // 5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 4) }, numbers: [3, 4] },
    },
    'uniformMatrix3x4fv': {  // WebGL2
      3: { arrays: { 2: checkArrayForUniform(12) }, },
      4: { arrays: { 2: checkArrayForUniformWithOffset(3, 12) }, numbers: [3] },
      5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 12) }, numbers: [3] },
      // 5: { arrays: { 2: checkArrayForUniformWithOffsetAndLength(3, 4) }, numbers: [3, 4] },
    },

    // attribute value setters
    'vertexAttrib1f': { 2: { numbers: [0, 1] } },
    'vertexAttrib2f': { 3: { numbers: [0, 1, 2] } },
    'vertexAttrib3f': { 4: { numbers: [0, 1, 2, 3] } },
    'vertexAttrib4f': { 5: { numbers: [0, 1, 2, 3, 4] } },

    'vertexAttrib1fv': { 2: { numbers: [0] } },
    'vertexAttrib2fv': { 2: { numbers: [0] } },
    'vertexAttrib3fv': { 2: { numbers: [0] } },
    'vertexAttrib4fv': { 2: { numbers: [0] } },

    'vertexAttribI4i': { 5: { numbers: [0, 1, 2, 3, 4] } },  // WebGL2
    'vertexAttribI4iv': { 2: { numbers: [0] } },  // WebGL2
    'vertexAttribI4ui': { 5: { numbers: [0, 1, 2, 3, 4] } },  // WebGL2
    'vertexAttribI4uiv': { 2: { numbers: [0] } },  // WebGL2

    // QueryObjects

    'beginQuery': { 2: { enums: [0] } },  // WebGL2
    'endQuery': { 1: { enums: [0] } },  // WebGL2
    'getQuery': { 2: { enums: [0, 1] } },  // WebGL2
    'getQueryParameter': { 2: { enums: [1] } },  // WebGL2

    //  Sampler Objects

    'samplerParameteri': { 3: { enums: [1] } },  // WebGL2
    'samplerParameterf': { 3: { enums: [1] } },  // WebGL2
    'getSamplerParameter': { 2: { enums: [1] } },  // WebGL2

    //  Sync objects

    'clientWaitSync': { 3: { enums: { 1: makeBitFieldToStringFunc(['SYNC_FLUSH_COMMANDS_BIT']) }, numbers: [2] } },  // WebGL2
    'fenceSync': { 2: { enums: [0] } },  // WebGL2
    'getSyncParameter': { 2: { enums: [1] } },  // WebGL2

    //  Transform Feedback

    'bindTransformFeedback': { 2: { enums: [0] } },  // WebGL2
    'beginTransformFeedback': { 1: { enums: [0] } },  // WebGL2

    // Uniform Buffer Objects and Transform Feedback Buffers
    'bindBufferBase': { 3: { enums: [0], numbers: [1] } },  // WebGL2
    'bindBufferRange': { 5: { enums: [0], numbers: [1, 3, 4] } },  // WebGL2
    'getIndexedParameter': { 2: { enums: [0], numbers: [1] } },  // WebGL2
    'getActiveUniforms': { 3: { enums: [2] } },  // WebGL2
    'getActiveUniformBlockParameter': { 3: { enums: [2], numbers: [1] } },  // WebGL2
    'getActiveUniformBlockName': { 2: { numbers: [1] } }, // WebGL2
    'transformFeedbackVaryings': { 3: { enums: [2] } }, // WebGL2
    'uniformBlockBinding': { 3: { numbers: [1, 2] } }, // WebGL2
  };
  for (const [name, fnInfos] of Object.entries(glFunctionInfos)) {
    for (const fnInfo of Object.values(fnInfos)) {
      convertToObjectIfArray(fnInfo, 'enums');
      convertToObjectIfArray(fnInfo, 'numbers');
      convertToObjectIfArray(fnInfo, 'arrays');
      convertToObjectIfArray(fnInfo, 'read');
    }
    if (/uniform(\d|Matrix)/.test(name)) {
      fnInfos.errorHelper = getUniformNameErrorMsg;
    }
  }

  const typedArrays = [
    { name: "Int8Array", ctor: HydInt8Array, },
    { name: "Uint8Array", ctor: HydUint8Array, },
    { name: "Uint8ClampedArray", ctor: HydUint8ClampedArray, },
    { name: "Int16Array", ctor: HydInt16Array, },
    { name: "Uint16Array", ctor: HydUint16Array, },
    { name: "Int32Array", ctor: HydInt32Array, },
    { name: "Uint32Array", ctor: HydUint32Array, },
    { name: "Float32Array", ctor: HydFloat32Array, },
    { name: "Float64Array", ctor: HydFloat64Array, },
  ];

  const elements = [
    { name: "image", ctor: HydImage },
    { name: "image", ctor: HydHTMLImageElement },
    { name: "canvas", ctor: HydHTMLCanvasElement },
    { name: "video", ctor: HydHTMLVideoElement },
    { name: "imagedata", ctor: HydImageData },
    { name: "imagebitmap", ctor: HydImageBitmap },
  ];

  const eolRE = /\n/g;
  const crRE = /\r/g;
  const quoteRE = /"/g;

  function glValueToString(ctx, functionName, numArgs, argumentIndex, value, helper, args) {
    const funcInfos = glFunctionInfos[functionName];
    const funcInfo = funcInfos ? funcInfos[numArgs] : undefined;

    if (value === undefined) {
      return 'undefined';
    } else if (value === null) {
      return 'null';
    } else if (typeof (value) === 'number') {
      if (funcInfo !== undefined) {
        if (funcInfo.enums) {
          const entry = funcInfo.enums[argumentIndex];
          if (typeof entry === 'function') {
            return entry(ctx, value)
          } else if (entry !== undefined) {
            return glEnums[value];
          }
        }
      }
      return value.toString();
    } else if (typeof (value) === 'string') {
      return JSON.stringify(value);
    } else if (value instanceof HydHTMLCanvasElement) {
      // Extract as ImageData
      if (helper.capturer.serializeLength > HydMaxSerializeSize || value.width * value.height > HydMaxArraySize) {
        HydAllSerialized = false;
        const tmp = `new generateZeroImageData(${value.width}, ${value.height})`;
        if (!helper.zeroArrays.has(tmp)) {
          helper.zeroArrays.set(tmp, helper.zeroArrays.size);
        }
        return `zeroArrays[${helper.zeroArrays.get(tmp)}]`;
      }
      return helper.doTexImage2DForBase64(value.toDataURL());
    } else if (value instanceof HydImageData) {
      if (helper.capturer.serializeLength > HydMaxSerializeSize || value.width * value.height > HydMaxArraySize) {
        HydAllSerialized = false;
        const tmp = `new generateZeroImageData(${value.width}, ${value.height})`;
        if (!helper.zeroArrays.has(tmp)) {
          helper.zeroArrays.set(tmp, helper.zeroArrays.size);
        }
        return `zeroArrays[${helper.zeroArrays.get(tmp)}]`;
      }
      const canvas = document.createElement('canvas');
      canvas.height = value.height;
      canvas.width = value.width;
      const temp_context = canvas.getContext('2d');
      temp_context.putImageData(value, 0, 0);
      const base64 = canvas.toDataURL();
      canvas.remove();
      return helper.doTexImage2DForBase64(base64);
    } else if (
      (value instanceof HydHTMLImageElement) ||
      (value instanceof HydImage) ||
      (value instanceof HydHTMLVideoElement)
    ) {
      // Extract data.
      return helper.doTexImage2DForImage(value);
    } else if (value instanceof HydImageBitmap || value instanceof HydOffscreenCanvas) {
      if (helper.capturer.serializeLength > HydMaxSerializeSize || value.width * value.height > HydMaxArraySize) {
        HydAllSerialized = false;
        return `generateZeroImageData(${value.width}, ${value.height})`;
      }
      const canvas = document.createElement('canvas');
      canvas.height = value.height;
      canvas.width = value.width;
      const temp_context = canvas.getContext('2d');
      temp_context.drawImage(value, 0, 0);
      const base64 = canvas.toDataURL();
      canvas.remove();
      return helper.doTexImage2DForBase64(base64);
    } else if (value.length !== undefined) {
      if (funcInfo && funcInfo.read && funcInfo.read[argumentIndex]) {
        for (const type of typedArrays) {
          if (value instanceof type.ctor) {
            const tmp = `new ${type.name}(${value.length})`;
            if (helper.zeroArrays) {
              if (!helper.zeroArrays.has(tmp)) {
                helper.zeroArrays.set(tmp, helper.zeroArrays.size);
              }
              return `zeroArrays[${helper.zeroArrays.get(tmp)}]`;
            } else {
              return tmp;
            }
          }
        }
      }
      for (const type of typedArrays) {
        if (value instanceof type.ctor) {
          if (helper.capturer.serializeLength > HydMaxSerializeSize || value.length > HydMaxArraySize) {
            HydAllSerialized = false;
            const tmp = `new ${type.name}(${value.length})`;
            if (helper.zeroArrays) {
              if (!helper.zeroArrays.has(tmp)) {
                helper.zeroArrays.set(tmp, helper.zeroArrays.size);
              }
              return `zeroArrays[${helper.zeroArrays.get(tmp)}]`;
            } else {
              return tmp;
            }
          } else {
            const binaryData = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
            const base64String = window.btoa(hydArrayToBinaryString(binaryData));
            const luv = `base64ToTypedArray("${base64String}", ${type.name})`;
            let pos = helper.typedArraysMap.get(luv);

            if (pos === undefined) {
              pos = helper.typedArraysMap.size;
              helper.capturer.serializeLength += base64String.length;
              helper.typedArraysMap.set(luv, pos);
            }

            return `typedArrays[${pos}]`;
          }
        }
      }
      const values = [];
      const step = 32;
      for (let jj = 0; jj < value.length; jj += step) {
        const end = Math.min(jj + step, value.length);
        const sub = [];
        for (let ii = jj; ii < end; ++ii) {
          sub.push(typeof value[ii] === 'string' ? JSON.stringify(value[ii]) : value[ii].toString());
        }
        values.push(sub.join(","));
      }
      return `\n[\n${values.join(",\n")}\n]`;
    } else if (value instanceof HydArrayBuffer || value instanceof HydDataView) {
      if (helper.capturer.serializeLength > HydMaxSerializeSize || value.byteLength > HydMaxArraySize) {
        HydAllSerialized = false;
        tmp = `new ArrayBuffer(${value.byteLength})`;
        if (helper.zeroArrays) {
          if (!helper.zeroArrays.has(tmp)) {
            helper.zeroArrays.set(tmp, helper.zeroArrays.size);
          }
          return `zeroArrays[${helper.zeroArrays.get(tmp)}]`;
        } else {
          return tmp;
        }
      } else {
        const binaryData = new Uint8Array(value);
        const base64String = window.btoa(hydArrayToBinaryString(binaryData));
        const luv = `base64ToTypedArray("${base64String}",Uint8Array)`;
        let pos = helper.typedArraysMap.get(luv);

        if (pos === undefined) {
          pos = helper.typedArraysMap.size;
          helper.capturer.serializeLength += base64String.length;
          helper.typedArraysMap.set(luv, pos);
        }

        return `typedArrays[${pos}].buffer`;
      }
    } else if (typeof (value) === 'object') {
      if (value.__capture_info__ !== undefined) {
        return getResourceName(value);
      } else {
        for (const type of elements) {
          if (value instanceof type.ctor) {
            // TODO: add a way to get the resource
            return type.name + "<-----------";
          }
        }
        const values = [];
        for (const [k, v] of Object.entries(value)) {
          values.push(`"${k}": ${glValueToString(ctx, "", 0, -1, v, helper, null)}`);
        }
        return `{\n    ${values.join(",\n    ")}}`;
      }
    }
    return value.toString();
  }

  function glArgsToStringList(ctx, functionName, args, helper) {
    if (args === undefined) {
      return [];
    }

    const funcInfos = glFunctionInfos[functionName];
    const funcInfo = funcInfos ? funcInfos[args.length] : undefined;
    if (funcInfo && funcInfo.arrays) {
      for (let argumentIndex = 0; argumentIndex < args.length; ++argumentIndex) {
        if (funcInfo.arrays[argumentIndex] && typeof (funcInfo.arrays[argumentIndex]) === 'function') {
          let value = args[argumentIndex];
          if (value instanceof HydArrayBuffer || value instanceof HydDataView) {
            const [offset, length, newArgs] = funcInfo.arrays[argumentIndex](args);
            if (newArgs) {
              args = newArgs;
            }
            if (offset) {
              if (length) {
                value = value.slice(offset, offset + length);
              } else {
                value = value.slice(offset);
              }
            }
            args[argumentIndex] = value;
            break;
          } else {
            let found = false;
            for (const type of typedArrays) {
              if (value instanceof type.ctor) {
                const b = value.BYTES_PER_ELEMENT;
                found = true;
                const [offset, length, newArgs] = funcInfo.arrays[argumentIndex](args);
                if (newArgs) {
                  args = newArgs;
                }
                if (offset) {
                  if (length) {
                    value = value.slice(offset / b, offset / b + length / b);
                  } else {
                    value = value.slice(offset / b);
                  }
                }
                args[argumentIndex] = value;
                break;
              }
            }
            if (found) {
              break;
            }
          }
        }
      }
    }
    const values = [];
    for (let ii = 0; ii < args.length; ++ii) {
      values.push(glValueToString(ctx, functionName, args.length, ii, args[ii], helper, args));
    }
    return values;
  }

  function glArgsToString(ctx, functionName, args, helper) {
    return glArgsToStringList(ctx, functionName, args, helper).join(",");
  }

  function makePropertyWrapper(wrapper, original, propertyName) {
    //log("wrap prop: " + propertyName);
    wrapper.__defineGetter__(propertyName, function () {
      return original[propertyName];
    });
    // TODO(gman): this needs to handle properties that take more than
    // one value?
    wrapper.__defineSetter__(propertyName, function (value) {
      //log("set: " + propertyName);
      original[propertyName] = value;
    });
  }

  // Makes a function that calls a function on another object.
  function makeFunctionWrapper(apiName, original, functionName, capturer, helper) {
    //log("wrap fn: " + functionName);
    const f = original[functionName];
    return function (...args) {
      //log("call: " + functionName);
      // if (functionName === 'clear') {
      //   debugger;
      // }
      if (capturer.capture) {
        const str = `${apiName}.${functionName}(${glArgsToString(this, functionName, args, helper)});`;
        capturer.addData(str);
      }
      const result = f.apply(original, args);
      return result;
    };
  }

  function wrapFunction(name, fn, helper) {
    return function (...args) {
      return fn.call(helper, name, args);
    };
  }

  function makeWrapper(apiName, original, helper, capturer) {
    const wrapper = {};
    Object.setPrototypeOf(wrapper, original.constructor.prototype);  // Make THREE.js compability check returns proper result.
    for (const propertyName in original) {
      if (typeof original[propertyName] === 'number') {
        glEnums[original[propertyName]] = apiName + "." + propertyName;
      }
      if (typeof original[propertyName] === 'function') {
        const handler = helper.constructor.prototype["handle_" + propertyName];
        if (handler) {
          wrapper[propertyName] = wrapFunction(propertyName, handler, helper);
        } else {
          wrapper[propertyName] = makeFunctionWrapper(apiName, original, propertyName, capturer, helper);
        }
      } else {
        makePropertyWrapper(wrapper, original, propertyName);
      }
    }
    addEnumsForContext(original, apiName);
    return wrapper;
  }

  class HydWebGLWrapper {
    constructor(ctx, capturer) {
      this.zeroArrays = new Map();
      this.ctx = ctx;
      this.capturer = capturer;
      this.currentProgram = null;
      this.programs = [];
      this.numImages = 0;
      this.imageUrl2Id = new Map();
      this.imagesBase64 = {};
      this.extensions = {};
      this.typedArraysMap = new Map();
      this.shaderSources = [];
      const gl = this.ctx;
      this.fb = gl.createFramebuffer();
      this.shaderBySource = {
      };
      this.ids = {};

      this.wrapper = makeWrapper("gl", gl, this, capturer);
    }

    generate() {
      // const out = [];
      const out = new hydpako.Deflate({ to: 'string' });

      out.pushLine = function (s, flush_mode = false) {
        this.push(s, false);
        this.push("\n", flush_mode);
      }

      out.pushLine(`<!-- length of the captured commands: ${this.capturer.data.length}-->`);
      out.pushLine(`<!-- all serialized: ${HydAllSerialized}-->`);

      out.pushLine(`<canvas id="__main-canvas__" width="${this.ctx.canvas.width}" height="${this.ctx.canvas.height}"></canvas>`);
      for (const [b64_id, base64] of Object.entries(this.imagesBase64)) {
        out.pushLine(`<img id="__hyd_img_b64_${b64_id}__" src="${base64}" hidden>`);
      }
      out.pushLine("<script>");
      out.pushLine(`window.HydAllSerialized = ${HydAllSerialized};`);
      out.pushLine(`window.HydMaxSerializeSize = ${HydMaxSerializeSize};`);
      out.pushLine(`window.HydMaxArraySize = ${HydMaxArraySize};`);
      out.pushLine(`
window.captureDone = false;
function base64ToTypedArray(b64, dt) {
  const bs = window.atob(b64);
  const u8a = new Uint8Array(bs.length);
  for (let i = 0; i < bs.length; i++) {
    u8a[i] = bs.charCodeAt(i);
  }
  return new dt(u8a.buffer);
}
function generateZeroImageData(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  canvas.remove();
  return imageData;
}
    `);
      if (this.zeroArrays.size > 0) {
        out.pushLine('const zeroArrays = {');
        this.zeroArrays.forEach((value, key) => { out.pushLine(`${value}: ${key},`); });
        out.pushLine(`};`);
      }

      if (this.typedArraysMap.size > 0) {
        out.pushLine('const typedArrays = {');
        this.typedArraysMap.forEach((value, key) => { out.pushLine(`${value}: ${key},`); });
        out.pushLine(`};`);
      }

      if (this.shaderSources.length > 0) {
        out.pushLine('const shaderSources = [');
        out.pushLine(this.shaderSources.map(s => `\`${s.replace(/`/g, '\\`')}\``).join(',\n'));
        out.pushLine(`];`);
      }

      if (this.helper) {
        out.pushLine(`
      function setUniform(gl, type, program, name, ...args) {
        const loc = gl.getUniformLocation(program, name);  
        const newArgs = [loc, ...args];
        gl[type].apply(gl, args);
      }
      `);
      }

      if (this.numImages > 0) {
        out.pushLine(`
      const imagesUrl = { };
      const imagesBase64 = { };
      function loadImages() {
`);
        for (const b64_id of Object.keys(this.imagesBase64)) {
          out.pushLine(`imagesBase64["${b64_id}"] = document.getElementById("__hyd_img_b64_${b64_id}__");`);
        }
        out.pushLine(
          `
      }
      `);
      }

      out.pushLine('const canvas = document.getElementById("__main-canvas__");');
      // out.pushLine(`const gl = canvas.getContext("${this.ctx.texImage3D ? 'webgl2' : 'webgl'}", ${glValueToString(this.ctx, "getContextAttributes", 0, -1, this.ctx.getContextAttributes())});`);
      out.pushLine(`const gl = canvas.getContext("${this.ctx.hydCanvasType}", ${glValueToString(this.ctx, "getContextAttributes", 0, -1, this.ctx.getContextAttributes(), this, null)});`);

      // Add extension objects.
      for (const key of Object.keys(this.extensions)) {
        out.pushLine(`const ${key} = gl.getExtension("${key}");`);
      }

      // Add resource arrays.
      for (const key of Object.keys(this.ids)) {
        out.pushLine(`const ${key} = [];`);
      }
      // out.pushLine("function render() {");
      out.pushLine(`
function* renderGenerator() {
`);
      // FIX:
      this.capturer.data.forEach(function (func) {
        out.pushLine(func());
      });
      // out.pushLine("}");
      out.pushLine(`
}
const renderIterator = renderGenerator();

function render() {
  if (renderIterator.next().done) {
    window.captureDone = true;
  } else {
    requestAnimationFrame(render);
  }
}
`);

      if (this.numImages > 0) {
        out.pushLine("loadImages();");
      }
      out.pushLine("requestAnimationFrame(render);");
      out.pushLine("</script>", true);
      // const compressed = hydpako.gzip(out.join('\n'), { to: 'string' });
      // return "data:json/gzip;base64," + window.btoa(compressed.reduce((str, charCode) => str + String.fromCharCode(charCode), ''));
      // return "data:json/gzip;base64," + window.btoa(compressed.map((charCode) => String.fromCharCode(charCode)).join(''));
      return "data:json/gzip;base64," + window.btoa(hydArrayToBinaryString(out.result));
    }

    // TODO: handle extensions
    handle_getExtension(name, args) {
      const extensionName = args[0].toLowerCase();
      let extension = this.extensions[extensionName];
      if (!extension) {
        extension = this.ctx[name].apply(this.ctx, args);
        if (extension) {
          if (extensionName.includes("oes_vertex_array_object")) {
            const originExtension = extension;

            extension = makeWrapper(extensionName, extension, {}, this.capturer);
            const wrapper = this;

            extension['createVertexArrayOES'] = function (...args) {
              const resource = originExtension['createVertexArrayOES'].apply(originExtension, args);
              const shortName = "vertexarrayoes"

              if (!wrapper.ids[shortName]) {
                wrapper.ids[shortName] = 0;
              }
              const id = wrapper.ids[shortName]++;
              resource.__capture_info__ = {
                id: id,
                type: shortName,
              };
              wrapper.capturer.addData(`${getResourceName(resource)} = ${extensionName}.createVertexArrayOES();`);
              return resource;
            }
          } else {
            extension = makeWrapper(extensionName, extension, {}, this.capturer);
          }
          this.extensions[extensionName] = extension;
        }
      }
      return extension;
    }

    handle_shaderSource(name, args) {
      const resource = args[0];
      const source = args[1];

      let shaderId = this.shaderBySource[source];
      if (shaderId === undefined) {
        shaderId = this.shaderSources.length;
        this.shaderSources.push(source);
        this.shaderBySource[source] = shaderId;
      }

      this.capturer.addData(`gl.${name}(${getResourceName(resource)}, shaderSources[${shaderId}]);`);
      this.ctx[name].apply(this.ctx, args);
    }

    handle_useProgram(name, args) {
      this.currentProgram = args[0];
      this.capturer.addData(`gl.${name}(${getResourceName(this.currentProgram)});`);
      this.ctx[name].apply(this.ctx, args);
    }

    handle_getUniformLocation(name, args) {
      const program = args[0];
      const uniformName = args[1];
      const info = program.__capture_info__;
      if (!info.uniformsByName) {
        info.uniformsByName = {};
      }
      if (!info.uniformsByName[name]) {
        const location = this.ctx.getUniformLocation(program, uniformName);
        if (!location) {
          return null;
        }
        location.__capture_info__ = {
          name: uniformName,
          value: undefined,
        };
        info.uniformsByName[uniformName] = location;
      }
      return info.uniformsByName[uniformName];
    }

    handle_getAttribLocation(name, args) {
      const program = args[0];
      const attribName = args[1];
      const info = program.__capture_info__;
      if (!info.attribsByName) {
        info.attribsByName = {};
        info.attribsByLocation = {};
      }
      if (!info.attribsByName[name]) {
        const location = this.ctx.getAttribLocation(program, attribName);
        if (location < 0) {
          return location;
        }
        info.attribsByName[attribName] = location;
        info.attribsByLocation[location] = attribName;
      }
      return info.attribsByName[attribName];
    }

    dumpAttribBindings(program) {
      const lines = [];
      const info = program.__capture_info__;
      if (info && info.attribsByName) {
        for (const attrib in info.attribsByName) {
          lines.push(`gl.bindAttribLocation(${getResourceName(program)}, ${info.attribsByName[attrib]}, "${attrib}");`);
        }
      }
      return lines.join("\n");
    }

    handle_bindAttribLocation(name, args) {
      // We don't need to dump bindAttribLocation because we bind all locations at link time.
      this.ctx[name].apply(this.ctx, args);
    }

    handle_linkProgram(name, args) {
      const program = args[0];
      // Must bind all attribs before link.
      const self = this;
      this.capturer.addFn(function () {
        return self.dumpAttribBindings(program);
      });
      this.capturer.addData(`gl.${name}(${getResourceName(program)});`);
      this.ctx[name].apply(this.ctx, args);
    }

    handle_fenceSync(name, args) {
      const condition = glEnums[args[0]]; // string
      const flags = args[1]; // number
      const resource = this.ctx[name].apply(this.ctx, args);
      const shortName = "sync"

      if (!this.ids[shortName]) {
        this.ids[shortName] = 0;
      }
      const id = this.ids[shortName]++;
      resource.__capture_info__ = {
        id: id,
        type: shortName,
      };
      this.capturer.addData(`${getResourceName(resource)} = gl.${name}(${condition}, ${flags});`);
      return resource;
    }

    handle_uniform(name, args) {
      const location = args[0];
      const captureArgs = glArgsToStringList(this.ctx, name, args, this);
      // TODO(gman): handle merging of arrays.
      if (location === null) {
        this.capturer.addData(`gl.${name}(null,${captureArgs.slice(1).join(",")});`);
      } else {
        const info = location.__capture_info__;
        if (this.helper) {
          this.capturer.addData(`setUniform(gl,"${name}",${getResourceName(this.currentProgram)},"${info.name}",${captureArgs.slice(1).join(",")}};`);
        } else {
          this.capturer.addData(`gl.${name}(gl.getUniformLocation(${getResourceName(this.currentProgram)},"${info.name}"),${captureArgs.slice(1).join(",")});`);
        }
      }
      this.ctx[name].apply(this.ctx, args);
    }

    handle_create(name, args) {
      const resource = this.ctx[name].apply(this.ctx, args);
      const shortName = name.substring(6).toLowerCase();

      if (!this.ids[shortName]) {
        this.ids[shortName] = 0;
      }
      const id = this.ids[shortName]++;
      resource.__capture_info__ = {
        id: id,
        type: shortName,
      };
      this.capturer.addData(`${getResourceName(resource)} = gl.${name}(${glArgsToString(this.ctx, name, args, this)});`);
      return resource;
    }

    doTexImage2DForBase64(base64) {
      let imageId = this.numImages++;
      this.imagesBase64[imageId] = base64;
      this.capturer.serializeLength += base64.length;
      return `imagesBase64[${imageId}]`;
    }

    doTexImage2DForImage(image) {
      if (this.capturer.serializeLength > HydMaxSerializeSize || image.width * image.height > HydMaxArraySize) {
        HydAllSerialized = false;
        return `generateZeroImageData(${image.width}, ${image.height})`;
      }
      let imageId = null;
      if (!image.src.startsWith('data:')) {
        if (this.imageUrl2Id.get(image.src) === undefined) {
          const pos = this.numImages++;
          this.imageUrl2Id.set(image.src, pos);
          const canvas = document.createElement('canvas');
          canvas.height = image.height;
          canvas.width = image.width;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(image, 0, 0);
          this.imagesBase64[pos] = canvas.toDataURL();
          canvas.remove();
          this.capturer.serializeLength += this.imagesBase64[pos].length;
        }
        imageId = this.imageUrl2Id.get(image.src);
      } else {
        if (image.__hyd_imageBase64_id__ === undefined) {
          image.__hyd_imageBase64_id__ = this.numImages++;
          this.imagesBase64[image.__hyd_imageBase64_id__] = image.src;
        }
        imageId = image.__hyd_imageBase64_id__;
      }
      return `imagesBase64[${imageId}]`;
    }

    handle_get(name, args) {
      // Don't need the getXXX calls for playback.
      this.capturer.addData(`// gl.${name}(${glArgsToString(this.ctx, name, args, this)});`);
      return this.ctx[name].apply(this.ctx, args);
    }

    handle_skip(name, args) {
      this.capturer.addData(`// gl.${name}(${glArgsToString(this.ctx, name, args, this)});`);
      return this.ctx[name].apply(this.ctx, args);
    }
  }

  const handlers = {
    handle_skip: [
      "readPixels",
    ],
    handle_get: [
      "getActiveAttrib",
      "getActiveUniform",
      "getAttachedShaders",
      //    "getAttribLocation",
      "getBufferParameter",
      "getCheckFramebufferStatus",
      "getFramebufferAttachmentParameter",
      "getError",
      "getParameter",
      "getProgramLogInfo",
      "getProgramParameter",
      "getShaderLogInfo",
      "getShaderParameter",
      "getShaderPrecisionFormat",
      "getShaderSource",
      "getSupportedExtensions",
      "getUniform",
      //    "getUniformLocation",
      "getTextureParameter",
      "getVertexAttrib",
      "isBuffer",
      "isEnabled",
      "isFramebuffer",
      "isProgram",
      "isRenderbuffer",
      "isShader",
      "isTexture",
    ],
    handle_create: [
      "createBuffer",
      "createFramebuffer",
      "createProgram",
      "createQuery",
      "createRenderbuffer",
      "createSampler",
      "createShader",
      "createTexture",
      "createTransformFeedback",
      "createVertexArray",
    ],
    handle_uniform: [
      "uniform1f",
      "uniform2f",
      "uniform3f",
      "uniform4f",
      "uniform1i",
      "uniform2i",
      "uniform3i",
      "uniform4i",
      "uniform1fv",
      "uniform2fv",
      "uniform3fv",
      "uniform4fv",
      "uniform1iv",
      "uniform2iv",
      "uniform3iv",
      "uniform4iv",
      "uniformMatrix2fv",
      "uniformMatrix3fv",
      "uniformMatrix4fv",
    ],
  };
  for (const [handler, functions] of Object.entries(handlers)) {
    functions.forEach(function (name) {
      HydWebGLWrapper.prototype["handle_" + name] = HydWebGLWrapper.prototype[handler];
    });
  }

  class Capture {
    constructor(ctx, opt_options) {
      const options = opt_options || {};
      this.helper = options.helper === undefined ? true : options.helper;
      this.capture = false;
      this.data = [];
      this.serializeLength = 0;

      const helper = new HydWebGLWrapper(ctx, this);
      this.webglHelper = helper;
      this.webglWrapper = helper.wrapper;
      this.webglWrapper.capture = this;
      this.lastIsYield = false;
    }
    addFn(fn) {
      this.data.push(fn);
    }
    addData(str) {
      if (this.capture) {
        this.lastIsYield = false;
        this.addFn(() => str);
      }
    }
    addDebugInfo(str) {
      if (this.capture) {
        this.lastIsYield = false;
        this.addFn(() => `// ** HAN_DEBUG_INFO ** ${str}`);
      }
    }
    addYield() {
      if (this.capture && !this.lastIsYield) {
        this.lastIsYield = true;
        this.addFn(() => "yield;");
      }
    }

    log(msg) {
      if (this.capture) {
        console.log(msg);
      }
    }

    getContext() {
      return this.webglWrapper;
    }

    begin() {
      this.capture = true;
    }

    end() {
      this.capture = false;
    }

    period(timeout) {
      this.begin();
      setTimeout(() => {
        this.end();
      }, timeout);
    }

    generate() {
      return this.webglHelper.generate();
    }
  }

  // Wrap canvas.getContext;
  let autoCapture = true;

  // Save contexts
  let glContexts = new Set();

  function init(ctx, opt_options) {
    // Make a an object that has a copy of every property of the WebGL context
    // but wraps all functions.
    if (!ctx.capture) {
      ctx.capture = new Capture(ctx, opt_options);
      if (autoCapture) {
        ctx.capture.begin();
      }
    }
    return ctx.capture.getContext();
  }

  HydHTMLCanvasElement.prototype.getContext = (function (oldFn) {
    return function (...args) {
      let ctx = oldFn.apply(this, args);
      const type = arguments[0];
      if (ctx && autoCapture && (type === "experimental-webgl" || type === "webgl" || type === "webgl2") && glContexts.has(ctx) === false) {
        glContexts.add(ctx);
        ctx.hydCanvasType = type;
        ctx = init(ctx); // 这里会改变 ctx.constructor.name
      }
      return ctx;
    };
  }(HydHTMLCanvasElement.prototype.getContext));

  const setAutoCapture = function (capture) {
    autoCapture = capture;
  };



  return {
    init: init,
    setAutoCapture: setAutoCapture,

    startAll: () => {
      glContexts.forEach(ctx => ctx.capture.begin());
    },
    stopAll: () => {
      glContexts.forEach(ctx => ctx.capture.end());
    },
    periodAll(timeout) {
      glContexts.forEach(ctx => ctx.capture.period(timeout));
    },
    addYieldAll: () => {
      glContexts.forEach(ctx => ctx.capture.addYield());
    },
    generateAll: () => {
      return Array.from(glContexts).map(ctx => ctx.capture.generate());
    },
    allStopped: () => {
      return glContexts.size === 0 || Array.from(glContexts).every(ctx => !ctx.capture.capture);
    },
    getContextsNum: () => {
      return glContexts.size;
    },
    debugInfoAll: (str) => {
      glContexts.forEach(ctx => ctx.capture.addDebugInfo(str));
    },
  };

}());

window.hydUsedOffScreenCanvas = [];

HydOffscreenCanvas.prototype.getContext = (function (oldFn) {
  return function (...args) {
    const ret = oldFn.apply(this, args);
    if (ret) {
      const type = args[0];
      if (window.hydUsedOffScreenCanvas.indexOf(type) === -1) {
        window.hydUsedOffScreenCanvas.push(type);
      }
    }
    return ret;
  }
})(HydOffscreenCanvas.prototype.getContext);


let hydRemainFrames = -1;

function hydRaf() {
  HydWebGLCapture.addYieldAll();
  if (hydRemainFrames > 0) {

    hydRemainFrames -= 1;
    if (hydRemainFrames === 0) {
      HydWebGLCapture.stopAll();
    }
  }

  requestAnimationFrame(hydRaf);
}
requestAnimationFrame(hydRaf);

function hydGetCounters() {
  return {
    hydContextsNum: HydWebGLCapture.getContextsNum(),
    hydUsedOffScreenCanvas: window.hydUsedOffScreenCanvas,
  }
}