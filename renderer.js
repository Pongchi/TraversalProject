const SwaggerEditorBundle = require('swagger-editor-dist/swagger-editor-bundle');
const SwaggerEditorStandalonePreset = require('swagger-editor-dist/swagger-editor-standalone-preset');

window.onload = function() {
  const ui = SwaggerEditorBundle({
    dom_id: '#swagger-editor',
    url: "https://petstore.swagger.io/v2/swagger.json",
    layout: 'EditorLayout'
  });

  window.ui = ui;
};

setTimeout(function() {
  const ui = SwaggerEditorBundle({
    dom_id: '#swagger-editor',
    url: "file://D:\\CASPER\\PathTraversal\\test.json",
    layout: 'EditorLayout',

    queryConfigEnabled: false,
  });

  window.ui = ui;
}, 3000)