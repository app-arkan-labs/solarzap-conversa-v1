if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => null;
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
}
