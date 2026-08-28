/* @ds-bundle: {"format":4,"namespace":"QuinkDesignSystem_6ae0bd","components":[{"name":"Bolt","sourcePath":"components/brand/Bolt.jsx"},{"name":"Micro","sourcePath":"components/brand/Micro.jsx"},{"name":"ThemeToggle","sourcePath":"components/brand/ThemeToggle.jsx"},{"name":"BOLT_PATH","sourcePath":"components/brand/Wordmark.jsx"},{"name":"Wordmark","sourcePath":"components/brand/Wordmark.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"ICON_NAMES","sourcePath":"components/core/Icon.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Segmented","sourcePath":"components/core/Segmented.jsx"},{"name":"Switch","sourcePath":"components/core/Switch.jsx"},{"name":"AvatarStack","sourcePath":"components/data/AvatarStack.jsx"},{"name":"Card","sourcePath":"components/data/Card.jsx"},{"name":"Group","sourcePath":"components/data/Group.jsx"},{"name":"Progress","sourcePath":"components/data/Progress.jsx"},{"name":"Row","sourcePath":"components/data/Row.jsx"},{"name":"State","sourcePath":"components/data/State.jsx"},{"name":"Thumb","sourcePath":"components/data/Thumb.jsx"},{"name":"Menu","sourcePath":"components/feedback/Menu.jsx"},{"name":"Notice","sourcePath":"components/feedback/Notice.jsx"},{"name":"Sheet","sourcePath":"components/feedback/Sheet.jsx"},{"name":"Toolbar","sourcePath":"components/feedback/Toolbar.jsx"},{"name":"Dropzone","sourcePath":"components/forms/Dropzone.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"}],"sourceHashes":{"components/brand/Bolt.jsx":"f99d8cf65fcf","components/brand/Micro.jsx":"cff8c113b73a","components/brand/ThemeToggle.jsx":"df6e30dbbf7b","components/brand/Wordmark.jsx":"52a5f5509a31","components/core/Button.jsx":"5abbc468b5a0","components/core/Chip.jsx":"871345fbd161","components/core/Icon.jsx":"6a656f8cd539","components/core/IconButton.jsx":"c5f55b39fe17","components/core/Segmented.jsx":"816f0d318d5e","components/core/Switch.jsx":"73c14e78fcb8","components/data/AvatarStack.jsx":"55a67654704f","components/data/Card.jsx":"2efc19fbda0e","components/data/Group.jsx":"9ccfb437f0a3","components/data/Progress.jsx":"0772ee02da96","components/data/Row.jsx":"d3615566f8c2","components/data/State.jsx":"7a653602ea85","components/data/Thumb.jsx":"c3ccfefbb7ab","components/feedback/Menu.jsx":"0b1aec84284d","components/feedback/Notice.jsx":"4e96ee114ead","components/feedback/Sheet.jsx":"66745ba5bc5a","components/feedback/Toolbar.jsx":"8114b4edb661","components/forms/Dropzone.jsx":"f86ceb30089d","components/forms/Field.jsx":"74eb087542fd","components/forms/Input.jsx":"952bec8fefb1","components/forms/Select.jsx":"46c70a344691","components/forms/Textarea.jsx":"8404c6ff7545","ui_kits/app/AppShell.jsx":"0a0aab80eea6","ui_kits/app/Editor.jsx":"ee23fbe276f7","ui_kits/app/Library.jsx":"bc321ce88551","ui_kits/app/Upload.jsx":"1a0d9f8b8739","ui_kits/app/data.jsx":"6e1beae146e4","ui_kits/first-run/Arrival.jsx":"286184393342","ui_kits/first-run/Building.jsx":"157394392c2a","ui_kits/first-run/Signup.jsx":"7476bb4befbd","ui_kits/first-run/firstRunData.jsx":"0571fa8cab1a","ui_kits/marketing/MarketingHome.jsx":"3f5e7b2f24d8","ui_kits/reader/ReaderChrome.jsx":"73eca2ff76c2","ui_kits/reader/ReaderScreens.jsx":"b3df620ea1c8","ui_kits/reader/readerData.jsx":"4ffdb51806b7"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.QuinkDesignSystem_6ae0bd = window.QuinkDesignSystem_6ae0bd || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/Micro.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// v1's tracked-uppercase brand-coloured eyebrow is gone: next to a serif headline it read as
// a second, competing voice. v2's micro-label is mono, muted and small — metadata, not
// a herald. Used for rail captions, group counts, article meta.
function Micro({
  children,
  as: Tag = 'p',
  color,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: "q-micro",
    style: {
      color,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Micro });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Micro.jsx", error: String((e && e.message) || e) }); }

// components/brand/Wordmark.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// The Quink wordmark: "Qu⚡nk" — the "i" is a lightning bolt. Letters inherit
// currentColor so the mark adapts to its context; the bolt keeps its green accent, because
// there it is a letter in a logo rather than a themeable UI element.
const BOLT = '#2F7D57';

// ONE copy of the bolt path: the wordmark draws it as the "i", and <Bolt> draws it alone.
const BOLT_PATH = 'M279.364 80.3615C278.99 78.492 277.907 77.1435 276.918 77.2095L262.087 78.2001L268.043 22.3883C268.164 20.4857 267.759 18.1446 266.707 17.2676C265.624 15.9191 264.667 16.4567 263.741 17.4658L225.815 81.5702C225.167 83.0343 224.799 84.9534 225.419 86.8065C226.04 88.6595 227.123 90.0081 228.112 89.942L242.943 88.9514L236.987 144.763C236.866 146.666 237.271 149.007 238.323 149.884C238.601 150.339 239.127 150.777 239.622 150.744C240.116 150.711 240.579 150.207 241.042 149.702L278.968 85.5978C279.615 84.1337 279.984 82.2146 279.364 80.3615Z';
function Wordmark({
  height = 22,
  tone = 'current',
  style,
  ...rest
}) {
  const color = tone === 'ink' ? 'var(--ink)' : tone === 'light' ? 'var(--paper)' : 'currentColor';
  return /*#__PURE__*/React.createElement("svg", _extends({
    height: height,
    viewBox: "0 0 472 151",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    role: "img",
    "aria-label": "Quink",
    style: {
      display: 'block',
      color,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    d: "M58.68 130.14C47.04 130.14 36.84 127.44 28.08 122.04C19.32 116.64 12.42 109.08 7.38 99.36C2.46 89.52 0 78.12 0 65.16C0 52.08 2.46 40.68 7.38 30.96C12.3 21.12 19.14 13.5 27.9 8.1C36.78 2.7 47.04 0 58.68 0C70.56 0 80.94 2.7 89.82 8.1C98.7 13.5 105.6 21.12 110.52 30.96C115.44 40.68 117.9 52.08 117.9 65.16C117.9 78.12 115.38 89.52 110.34 99.36C105.42 109.08 98.52 116.64 89.64 122.04C80.76 127.44 70.44 130.14 58.68 130.14ZM112.14 136.62L62.64 88.38L73.44 77.04L123.3 125.82L112.14 136.62ZM58.68 112.68C67.08 112.68 74.28 110.76 80.28 106.92C86.28 102.96 90.96 97.44 94.32 90.36C97.68 83.16 99.36 74.76 99.36 65.16C99.36 55.44 97.68 47.04 94.32 39.96C90.96 32.76 86.28 27.24 80.28 23.4C74.28 19.44 67.08 17.46 58.68 17.46C50.52 17.46 43.38 19.38 37.26 23.22C31.26 27.06 26.58 32.58 23.22 39.78C19.98 46.86 18.36 55.32 18.36 65.16C18.36 74.88 19.98 83.34 23.22 90.54C26.58 97.62 31.26 103.08 37.26 106.92C43.38 110.76 50.52 112.68 58.68 112.68Z"
  }), /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    d: "M174.478 129.42C167.878 129.42 162.178 128.1 157.378 125.46C152.698 122.7 149.098 118.8 146.578 113.76C144.178 108.6 142.978 102.36 142.978 95.04V39.06H160.618V89.46C160.618 94.74 161.278 99.24 162.598 102.96C163.918 106.56 165.958 109.32 168.718 111.24C171.598 113.04 175.198 113.94 179.518 113.94C184.558 113.94 188.638 112.68 191.758 110.16C194.998 107.64 197.398 103.92 198.958 99C200.518 93.96 201.298 87.72 201.298 80.28V39.06H218.758V127.8H201.298V108.72L204.898 109.44C202.258 116.04 198.238 121.02 192.838 124.38C187.438 127.74 181.318 129.42 174.478 129.42Z"
  }), /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    d: "M290.308 127.8V39.06H308.128V58.32L304.528 59.4C306.088 54.48 308.308 50.46 311.188 47.34C314.188 44.1 317.668 41.64 321.628 39.96C325.708 38.28 330.088 37.44 334.768 37.44C344.608 37.44 352.288 40.32 357.808 46.08C363.448 51.72 366.268 60 366.268 70.92V127.8H348.628V77.4C348.628 68.88 347.068 62.64 343.948 58.68C340.948 54.72 336.268 52.74 329.908 52.74C325.108 52.74 321.088 53.82 317.848 55.98C314.728 58.14 312.328 61.56 310.648 66.24C308.968 70.92 308.128 76.86 308.128 84.06V127.8H290.308Z"
  }), /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    d: "M450.28 127.8L422.02 83.88L405.64 101.52V79.02L444.34 39.06H466.84L434.8 72L471.16 127.8H450.28ZM389.8 127.8V2.34H407.62V127.8H389.8Z"
  }), /*#__PURE__*/React.createElement("path", {
    fill: BOLT,
    d: BOLT_PATH
  }));
}
Object.assign(__ds_scope, { BOLT_PATH, Wordmark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Wordmark.jsx", error: String((e && e.message) || e) }); }

// components/brand/Bolt.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// The mark on its own, inheriting currentColor — unlike the wordmark's bolt, which keeps
// its green because there it is a letter in a logo rather than a UI element.
function Bolt({
  height = 11,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("svg", _extends({
    height: height,
    viewBox: "224 15 57 137",
    fill: "none",
    "aria-hidden": true,
    style: {
      display: 'block',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    d: __ds_scope.BOLT_PATH
  }));
}
Object.assign(__ds_scope, { Bolt });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Bolt.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// The only surviving pill, and it earns it: a chip is a CONTROL. Selected state is an ink
// fill (not brand) so a row of chips doesn't compete with the primary button beside it.
function Chip({
  children,
  count,
  on = false,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: 'q-chip' + (on ? ' on' : '') + (className ? ' ' + className : ''),
    "aria-pressed": on
  }, rest), children, count != null && /*#__PURE__*/React.createElement("span", {
    className: "q-chip-n"
  }, count));
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Lucide paths, inlined. The source app has no icon package — every glyph is a hand-inlined
// Lucide path. v2 keeps that, raises the default size to 17 (16 was small beside 16px body)
// and adds the state glyphs that replaced the coloured status dots.
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
};
const PATHS = {
  book: /*#__PURE__*/React.createElement("path", {
    d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"
  }),
  box: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 2.5 21 7v10l-9 4.5L3 17V7l9-4.5Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 7l9 4.5L21 7M12 11.5V21.5"
  })),
  palette: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "13.5",
    cy: "6.5",
    r: ".6",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "17.5",
    cy: "10.5",
    r: ".6",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "7.5",
    r: ".6",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6.5",
    cy: "12.5",
    r: ".6",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2Z"
  })),
  external: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M15 3h6v6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 14 21 3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
  })),
  globe: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 12h18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9Z"
  })),
  people: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "7.5",
    r: "3.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 4.2a3.5 3.5 0 0 1 0 6.6M22 20v-1.5a4 4 0 0 0-3-3.87"
  })),
  search: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 21-4.6-4.6"
  })),
  folder: /*#__PURE__*/React.createElement("path", {
    d: "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"
  }),
  'folder-plus': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 10.5v6M9 13.5h6"
  })),
  pencil: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 20h9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
  })),
  trash: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3 6h18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
  })),
  dots: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "5",
    cy: "12",
    r: "1.6",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "1.6",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "12",
    r: "1.6",
    fill: "currentColor",
    stroke: "none"
  })),
  chevron: /*#__PURE__*/React.createElement("path", {
    d: "M6 9.5l6 6 6-6"
  }),
  'chevron-right': /*#__PURE__*/React.createElement("path", {
    d: "M9 6l6 6-6 6"
  }),
  check: /*#__PURE__*/React.createElement("path", {
    d: "M20 6.5 9 17.5l-5-5"
  }),
  plus: /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14M5 12h14"
  }),
  x: /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  }),
  upload: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 8l-5-5-5 5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 3v12"
  })),
  film: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "2.5",
    y: "4",
    width: "19",
    height: "16",
    rx: "2.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 4v16M17 4v16M2.5 12h19M2.5 8h4.5M2.5 16h4.5M17 8h4.5M17 16h4.5"
  })),
  image: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "3.5",
    width: "18",
    height: "17",
    rx: "2.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.75",
    cy: "9.25",
    r: "1.75"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 15.5-4.35-4.35a2 2 0 0 0-2.83 0L3 21.5"
  })),
  file: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 2.5V8h5.5"
  })),
  link: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
  })),
  eye: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M2.5 12s3.6-6.5 9.5-6.5S21.5 12 21.5 12s-3.6 6.5-9.5 6.5S2.5 12 2.5 12Z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "2.75"
  })),
  'eye-off': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3 3l18 18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10.6 5.7A9.9 9.9 0 0 1 12 5.5c5.9 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.4 3.3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6.6 7.4A16.7 16.7 0 0 0 2.5 12s3.6 6.5 9.5 6.5a9.6 9.6 0 0 0 3.9-.8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9.7 9.9a2.75 2.75 0 0 0 3.9 3.9"
  })),
  sparkle: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6L5.7 9.8l4.6-1.7Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M18.5 16.5l.65 1.7 1.7.65-1.7.65-.65 1.7-.65-1.7-1.7-.65 1.7-.65Z"
  })),
  arrow: /*#__PURE__*/React.createElement("path", {
    d: "M5 12h13M12.5 6l6 6-6 6"
  }),
  'arrow-left': /*#__PURE__*/React.createElement("path", {
    d: "M19 12H6M11.5 6l-6 6 6 6"
  }),
  undo: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M9 14 4 9l5-5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 9h10a6 6 0 0 1 0 12h-3"
  })),
  redo: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M15 14l5-5-5-5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 9H10a6 6 0 0 0 0 12h3"
  })),
  lock: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "4.5",
    y: "10.5",
    width: "15",
    height: "10.5",
    rx: "2.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 10.5V7a4 4 0 0 1 8 0v3.5"
  })),
  clock: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 7.5V12l3 2"
  })),
  sun: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"
  })),
  moon: /*#__PURE__*/React.createElement("path", {
    d: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
  }),
  // --- state glyphs: these replaced the coloured dots ---
  'check-circle': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m8.5 12.2 2.4 2.4 4.6-4.9"
  })),
  'dot-circle': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3",
    fill: "currentColor",
    stroke: "none"
  })),
  'arrow-up-circle': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 16V8.5M8.6 11.9 12 8.5l3.4 3.4"
  })),
  alert: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 3.8 2.8 19.5h18.4L12 3.8Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 9.5v4.2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "16.6",
    r: ".8",
    fill: "currentColor",
    stroke: "none"
  })),
  'draft-circle': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9",
    strokeDasharray: "3 3"
  })),
  grip: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "6",
    r: "1.3",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "15",
    cy: "6",
    r: "1.3",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "12",
    r: "1.3",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "15",
    cy: "12",
    r: "1.3",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "18",
    r: "1.3",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "15",
    cy: "18",
    r: "1.3",
    fill: "currentColor",
    stroke: "none"
  })),
  bold: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M7 4.5h6a3.75 3.75 0 0 1 0 7.5H7Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 12h6.75a3.75 3.75 0 0 1 0 7.5H7Z"
  })),
  italic: /*#__PURE__*/React.createElement("path", {
    d: "M15.5 4.5h-6M14 19.5H8M14.5 4.5 10 19.5"
  }),
  split: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3 12h18",
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 7.5 12 3.5l4 4M8 16.5l4 4 4-4"
  })),
  merge: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 3.5v7M12 20.5v-7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 7 12 3.5 15.5 7M8.5 17 12 20.5 15.5 17"
  }))
};
const ICON_NAMES = Object.keys(PATHS);
function Icon({
  name,
  size = 17,
  strokeWidth = 1.75,
  rotate,
  style,
  ...rest
}) {
  const glyph = PATHS[name];
  if (!glyph) return null;
  return /*#__PURE__*/React.createElement("svg", _extends({
    width: size,
    height: size,
    viewBox: "0 0 24 24"
  }, stroke, {
    strokeWidth: strokeWidth,
    "aria-hidden": true,
    style: {
      flex: 'none',
      transform: rotate ? `rotate(${rotate}deg)` : undefined,
      transition: rotate != null ? 'transform var(--dur-3) var(--ease)' : undefined,
      ...style
    }
  }, rest), glyph);
}
Object.assign(__ds_scope, { ICON_NAMES, Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/brand/ThemeToggle.jsx
try { (() => {
// v2 ships light + dark. The toggle writes data-theme on <html> and remembers the choice;
// with no stored choice it follows the OS.
function ThemeToggle({
  target,
  storageKey = 'quink-theme'
}) {
  const root = () => target || document.documentElement;
  const [theme, setTheme] = React.useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {/* private mode */}
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  React.useEffect(() => {
    root().setAttribute('data-theme', theme);
    try {
      localStorage.setItem(storageKey, theme);
    } catch (e) {/* private mode */}
  }, [theme]);
  return /*#__PURE__*/React.createElement("button", {
    className: "q-ib",
    "aria-label": theme === 'dark' ? 'Switch to light' : 'Switch to dark',
    title: theme === 'dark' ? 'Switch to light' : 'Switch to dark',
    onClick: () => setTheme(theme === 'dark' ? 'light' : 'dark')
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: theme === 'dark' ? 'sun' : 'moon',
    size: 17
  }));
}
Object.assign(__ds_scope, { ThemeToggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/ThemeToggle.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// v2: no borders anywhere. A secondary button is a RAISED NEUTRAL SURFACE, a ghost button
// has no surface at rest. Hover deepens the fill and lifts the shadow one step; press
// settles 1.5%. Nothing recolours a border, because nothing has one.
function Button({
  children,
  variant = 'primary',
  size,
  icon,
  iconAfter,
  pill,
  full,
  as,
  className = '',
  ...rest
}) {
  const Tag = as || (rest.href ? 'a' : 'button');
  const cls = ['q-btn', variant !== 'primary' && 'q-btn--' + variant, size && 'q-btn--' + size, pill && 'q-btn--pill', full && 'q-btn--full', className].filter(Boolean).join(' ');
  const iconSize = size === 'lg' ? 19 : size === 'sm' ? 15 : 17;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: iconSize
  }), children, iconAfter && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconAfter,
    size: iconSize
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Ghost by default — a square of hover fill, no border, no resting surface. `raised` is for
// icon buttons that float on content (undo/redo in the editor bar, screenshot swap).
function IconButton({
  icon,
  label,
  size,
  tone,
  raised,
  iconSize,
  className = '',
  ...rest
}) {
  const cls = ['q-ib', size === 'sm' && 'q-ib--sm', raised && 'q-ib--raised', tone === 'critical' && 'q-ib--critical', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    className: cls,
    "aria-label": label,
    title: label
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: iconSize || (size === 'sm' ? 15 : 17)
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Segmented.jsx
try { (() => {
// A sliding thumb, not a filled active segment. The movement is what tells you the options
// are one control — and it is the one place v2 spends a spring.
function Segmented({
  options = [],
  value,
  onChange,
  style
}) {
  const opts = options.map(o => typeof o === 'string' ? {
    value: o,
    label: o
  } : o);
  const refs = React.useRef([]);
  const [thumb, setThumb] = React.useState({
    left: 3,
    width: 0
  });
  const idx = Math.max(0, opts.findIndex(o => o.value === value));
  React.useEffect(() => {
    const el = refs.current[idx];
    if (el) setThumb({
      left: el.offsetLeft,
      width: el.offsetWidth
    });
  }, [idx, options.length]);
  return /*#__PURE__*/React.createElement("div", {
    className: "q-seg",
    style: style,
    role: "group"
  }, /*#__PURE__*/React.createElement("span", {
    className: "q-seg-thumb",
    style: {
      transform: `translateX(${thumb.left - 3}px)`,
      width: thumb.width || undefined,
      opacity: thumb.width ? 1 : 0
    }
  }), opts.map((o, i) => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    ref: el => refs.current[i] = el,
    type: "button",
    "aria-pressed": value === o.value,
    onClick: () => onChange && onChange(o.value)
  }, o.label)));
}
Object.assign(__ds_scope, { Segmented });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Segmented.jsx", error: String((e && e.message) || e) }); }

// components/core/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Switch({
  checked = false,
  onChange,
  label,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    role: "switch",
    "aria-checked": checked,
    "aria-label": label,
    className: 'q-sw' + (checked ? ' on' : ''),
    onClick: () => onChange && onChange(!checked),
    style: style
  }, rest));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Switch.jsx", error: String((e && e.message) || e) }); }

// components/data/AvatarStack.jsx
try { (() => {
// Initials only — Quink stores no profile photos. Colour is derived from the name so the same
// person is always the same colour without storing one.
const HUES = [205, 158, 72, 300, 25, 250];
function hueFor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return HUES[h % HUES.length];
}
function AvatarStack({
  people = [],
  max = 4,
  size = 28,
  style
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return /*#__PURE__*/React.createElement("span", {
    className: "q-avs",
    style: style
  }, shown.map((p, i) => {
    const name = typeof p === 'string' ? p : p.name;
    return /*#__PURE__*/React.createElement("span", {
      key: i,
      className: "q-av",
      title: name,
      style: {
        background: `oklch(48% 0.09 ${hueFor(name)})`,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4)
      }
    }, name.trim().charAt(0).toUpperCase());
  }), rest > 0 && /*#__PURE__*/React.createElement("span", {
    className: "q-av q-av--more",
    style: {
      width: size,
      height: size,
      fontSize: Math.round(size * 0.38)
    }
  }, "+", rest));
}
Object.assign(__ds_scope, { AvatarStack });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/AvatarStack.jsx", error: String((e && e.message) || e) }); }

// components/data/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// No border. A card is a raised surface: --surface-1 plus --e1 (plus the inner --edge light,
// which is what defines the edge in dark mode). `inset` goes the other way for wells.
function Card({
  children,
  pad,
  variant,
  interactive,
  className = '',
  as: Tag = 'div',
  ...rest
}) {
  const cls = ['q-card', pad === true && 'q-card--pad', pad === 'lg' && 'q-card--pad-lg', variant === 'inset' && 'q-card--inset', variant === 'panel' && 'q-panel', interactive && 'q-card--interactive', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Card.jsx", error: String((e && e.message) || e) }); }

// components/data/Group.jsx
try { (() => {
// Replaces v1's folder card. A group is a heading ON the page plus its rows on one raised
// surface — not a bordered box inside a bordered box. The heading is the serif.
function Group({
  name,
  count,
  actions,
  children,
  empty,
  quiet = false,
  style
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: 'q-group' + (quiet ? ' q-group--quiet' : ''),
    style: style
  }, /*#__PURE__*/React.createElement("header", {
    className: "q-group-hd"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "q-group-name"
  }, name), count != null && /*#__PURE__*/React.createElement("span", {
    className: "q-group-n"
  }, count), actions && /*#__PURE__*/React.createElement("span", {
    className: "q-group-actions"
  }, actions)), /*#__PURE__*/React.createElement("div", {
    className: "q-group-body"
  }, children, empty && /*#__PURE__*/React.createElement("p", {
    className: "q-group-empty"
  }, empty)));
}
Object.assign(__ds_scope, { Group });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Group.jsx", error: String((e && e.message) || e) }); }

// components/data/Progress.jsx
try { (() => {
// Determinate wherever the real stage data allows it. v2 has no spinner and no pulsing dot:
// a 3px rule that actually tracks the four pipeline stages tells the truth, and the truth is
// the reassurance.
function Progress({
  value,
  indeterminate = false,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'q-progress' + (indeterminate ? ' q-progress--indeterminate' : ''),
    style: style,
    role: "progressbar",
    "aria-valuenow": indeterminate ? undefined : Math.round(value * 100)
  }, /*#__PURE__*/React.createElement("div", {
    className: "q-progress-fill",
    style: {
      width: indeterminate ? undefined : (value * 100).toFixed(1) + '%'
    }
  }));
}
Object.assign(__ds_scope, { Progress });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Progress.jsx", error: String((e && e.message) || e) }); }

// components/data/Row.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// One list row. Hairline rule between siblings (an ink mix, not a beige line), full-bleed
// hover fill, a chevron that fades in. Deliberately NO indent-on-hover: shifting text under
// the pointer was a novelty tic in v1.
function Row({
  title,
  desc,
  meta,
  state,
  thumb,
  actions,
  arrow = true,
  as,
  className = '',
  ...rest
}) {
  const Tag = as || (rest.href ? 'a' : rest.onClick ? 'button' : 'div');
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: 'q-row ' + className
  }, rest), thumb, /*#__PURE__*/React.createElement("span", {
    className: "q-row-main"
  }, /*#__PURE__*/React.createElement("span", {
    className: "q-row-title"
  }, title), desc && /*#__PURE__*/React.createElement("span", {
    className: "q-row-desc"
  }, desc)), state, meta, actions && /*#__PURE__*/React.createElement("span", {
    className: "q-row-actions"
  }, actions), arrow && !actions && /*#__PURE__*/React.createElement("span", {
    className: "q-row-arw"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-right",
    size: 16
  })));
}
Object.assign(__ds_scope, { Row });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Row.jsx", error: String((e && e.message) || e) }); }

// components/data/State.jsx
try { (() => {
// This component is the direct answer to "the dots and pills give it an AI-generated feel".
// State is now a GLYPH plus a weighted label, with no container: colour and icon carry the
// meaning, and nothing gets a coloured bubble it didn't earn.
const MAP = {
  live: {
    icon: 'check-circle',
    label: 'Published',
    cls: 'q-state--live'
  },
  draft: {
    icon: 'draft-circle',
    label: 'Draft',
    cls: ''
  },
  unlisted: {
    icon: 'eye-off',
    label: 'Unlisted',
    cls: ''
  },
  edits: {
    icon: 'arrow-up-circle',
    label: 'Unpublished edits',
    cls: 'q-state--edits'
  },
  building: {
    icon: 'sparkle',
    label: 'Writing your guide',
    cls: 'q-state--building'
  },
  failed: {
    icon: 'alert',
    label: "Couldn't finish",
    cls: 'q-state--failed'
  },
  saving: {
    icon: 'dot-circle',
    label: 'Saving',
    cls: ''
  }
};
function State({
  state = 'draft',
  label,
  sub,
  size = 15,
  style
}) {
  const m = MAP[state] || MAP.draft;
  return /*#__PURE__*/React.createElement("span", {
    className: 'q-state ' + m.cls,
    style: style
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: m.icon,
    size: size
  }), label || m.label, sub && /*#__PURE__*/React.createElement("span", {
    className: "q-state-sub"
  }, sub));
}
Object.assign(__ds_scope, { State });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/State.jsx", error: String((e && e.message) || e) }); }

// components/data/Thumb.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// The step screenshot at rail scale. Landscape by default now (recordings are landscape);
// `tall` is the portrait/phone case. A missing frame is a state, not a gap.
function Thumb({
  src,
  index,
  tall = false,
  active = false,
  alt = '',
  style,
  ...rest
}) {
  const cls = ['q-thumb', tall && 'q-thumb--tall', !src && 'q-thumb--empty', active && 'is-active'].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls,
    style: style
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: alt
  }) : /*#__PURE__*/React.createElement("span", {
    className: "q-thumb-n"
  }, index));
}
Object.assign(__ds_scope, { Thumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Thumb.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Menu.jsx
try { (() => {
// Grouped dropdown. Items carry a consequence line; switch items apply on flip. Positioning
// is the caller's job — pass style, and use --z-menu so it lands above bars but below the
// floating selection toolbar.
function Menu({
  items = [],
  width,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "q-menu",
    style: {
      width,
      ...style
    },
    role: "menu"
  }, items.map((it, i) => {
    if (it.type === 'group') return /*#__PURE__*/React.createElement("p", {
      key: i,
      className: "q-menu-cap"
    }, it.label);
    if (it.type === 'divider') return /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "q-menu-sep"
    });
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      role: "menuitem",
      disabled: it.disabled,
      onClick: it.onClick,
      className: 'q-menu-it' + (it.critical ? ' q-menu-it--critical' : '')
    }, it.icon && /*#__PURE__*/React.createElement("span", {
      className: "q-menu-ic"
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: it.icon,
      size: 17
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, it.label, it.sub && /*#__PURE__*/React.createElement("small", null, it.sub)), it.switch != null && /*#__PURE__*/React.createElement(__ds_scope.Switch, {
      checked: it.switch,
      onChange: it.onToggle,
      label: String(it.label)
    }));
  }));
}
Object.assign(__ds_scope, { Menu });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Menu.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Notice.jsx
try { (() => {
// Replaces v1's amber banner. Same job, but it is a TINTED SURFACE with an icon rather than
// a bordered strip: the border-bottom-plus-amber-fill combination was the most 2000s shape in
// the old system. `bar` is the full-width variant for app-level warnings.
const ICONS = {
  neutral: 'clock',
  caution: 'clock',
  brand: 'sparkle',
  critical: 'alert'
};
function Notice({
  children,
  tone = 'neutral',
  icon,
  action,
  onDismiss,
  bar = false,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'q-notice' + (tone !== 'neutral' ? ' q-notice--' + tone : '') + (bar ? ' q-notice--bar' : ''),
    style: style
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon || ICONS[tone],
    size: 17
  }), /*#__PURE__*/React.createElement("span", {
    className: "q-notice-text"
  }, children), action, onDismiss && /*#__PURE__*/React.createElement("button", {
    className: "q-ib q-ib--sm",
    onClick: onDismiss,
    "aria-label": "Dismiss",
    style: {
      color: 'inherit',
      marginRight: -6
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 15
  })));
}
Object.assign(__ds_scope, { Notice });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Notice.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Sheet.jsx
try { (() => {
// v1's modal was centre-aligned with an icon tile above a title. v2 keeps the tile but goes
// LEFT-ALIGNED: centred body copy over five ragged lines is one of the things that read as
// amateurish, and a left rag with a real measure fixes it for free.
function Sheet({
  open = true,
  icon,
  done = false,
  title,
  lede,
  children,
  actions,
  onClose,
  width = 480
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "q-overlay",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "q-sheet",
    style: {
      maxWidth: width
    },
    onClick: e => e.stopPropagation(),
    role: "dialog",
    "aria-modal": "true"
  }, icon && /*#__PURE__*/React.createElement("span", {
    className: 'q-sheet-tile' + (done ? ' q-sheet-tile--done' : '')
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 22
  })), title && /*#__PURE__*/React.createElement("h2", null, title), lede && /*#__PURE__*/React.createElement("p", {
    className: "q-sheet-lede"
  }, lede), children, actions && /*#__PURE__*/React.createElement("div", {
    className: "q-sheet-actions"
  }, actions)));
}
Object.assign(__ds_scope, { Sheet });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Sheet.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toolbar.jsx
try { (() => {
// The floating selection toolbar — and the fix for a real v1 bug: it used to land underneath
// other controls. Two things prevent that here.
//
// 1. It sits at --z-toolbar, above every persistent control in the app.
// 2. `flip` places it BELOW the selection when there isn't room above, so it never has to
//    overlap the top bar in the first place. The caller passes the measured rect; the
//    component owns the decision.
//
// The third half of the fix isn't in this file: put .q-quiet-tools on the editor canvas while
// a toolbar is open, and every hover-revealed control fades out instead of fighting it.
const SAFE_TOP = 64;
function Toolbar({
  items = [],
  rect,
  style
}) {
  const flip = rect ? rect.top < SAFE_TOP + 52 : false;
  const pos = rect ? {
    left: rect.left + rect.width / 2,
    top: flip ? rect.bottom + 10 : rect.top - 10,
    transform: flip ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'
  } : {};
  return /*#__PURE__*/React.createElement("div", {
    className: "q-toolbar",
    style: {
      ...pos,
      ...style
    },
    role: "toolbar"
  }, items.map((it, i) => it.type === 'divider' ? /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "q-toolbar-sep"
  }) : /*#__PURE__*/React.createElement("button", {
    key: i,
    className: it.on ? 'on' : undefined,
    onClick: it.onClick,
    "aria-label": it.label,
    title: it.label,
    "aria-pressed": it.on
  }, it.icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: it.icon,
    size: 16
  }) : it.label)));
}
Object.assign(__ds_scope, { Toolbar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toolbar.jsx", error: String((e && e.message) || e) }); }

// components/forms/Dropzone.jsx
try { (() => {
// The dashed rectangle is gone — it was the most dated shape in v1. The affordance is now an
// inset well with a LIFTED icon tile inside it: the tile is the only thing on the screen
// casting a shadow, so the eye goes there. Drag-over tints the well and draws a 1.5px inset
// ring, which is the one moment a "border" is justified because it means "release here".
function Dropzone({
  state = 'idle',
  title = 'Drop your recordings here',
  sub,
  children,
  onClick,
  style
}) {
  if (state === 'loaded') {
    return /*#__PURE__*/React.createElement("div", {
      className: "q-dz q-dz--loaded",
      style: style
    }, children);
  }
  return /*#__PURE__*/React.createElement("div", {
    className: 'q-dz' + (state === 'over' ? ' over' : ''),
    onClick: onClick,
    style: style,
    role: "button",
    tabIndex: 0
  }, /*#__PURE__*/React.createElement("span", {
    className: "q-dz-tile"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "film",
    size: 24
  })), /*#__PURE__*/React.createElement("span", {
    className: "q-dz-title"
  }, title), sub && /*#__PURE__*/React.createElement("span", {
    className: "q-dz-sub"
  }, sub));
}
Object.assign(__ds_scope, { Dropzone });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Dropzone.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function Field({
  label,
  hint,
  optional = false,
  htmlFor,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "q-field",
    style: style
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "q-label",
    htmlFor: htmlFor
  }, label, optional && /*#__PURE__*/React.createElement("span", null, " \xB7 optional")), children, hint && /*#__PURE__*/React.createElement("p", {
    className: "q-hint"
  }, hint));
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Filled, not outlined. At rest it is an inset well (--surface-2); on focus it lifts to
// --surface-1 with an inset ring. That inversion — sinking at rest, rising on focus — is
// what makes v2's fields feel physical instead of drawn.
function Input({
  search = false,
  className = '',
  style,
  ...rest
}) {
  if (search) {
    return /*#__PURE__*/React.createElement("div", {
      className: "q-search",
      style: style
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "search",
      size: 17
    }), /*#__PURE__*/React.createElement("input", _extends({
      type: "search",
      className: 'q-input ' + className
    }, rest)));
  }
  return /*#__PURE__*/React.createElement("input", _extends({
    type: "text",
    className: 'q-input ' + className,
    style: style
  }, rest));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Select({
  options = [],
  className = '',
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'block',
      ...style
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    className: 'q-select ' + className
  }, rest), options.map(o => {
    const value = typeof o === 'string' ? o : o.value;
    const label = typeof o === 'string' ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: value,
      value: value
    }, label);
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 14,
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'var(--ink-3)',
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron",
    size: 15
  })));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Textarea({
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("textarea", _extends({
    className: 'q-textarea ' + className
  }, rest));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/AppShell.jsx
try { (() => {
const {
  Wordmark,
  Micro,
  ThemeToggle,
  Button,
  IconButton,
  Icon,
  AvatarStack
} = window.QuinkDesignSystem_6ae0bd;

// The app chassis. One bar, one rail, one content column — and a lot more air than v1.
// The bar is a raised surface at --z-bar; it has no bottom border, which is the whole
// difference between v2 and v1 at the top of every screen.

function Bar({
  left,
  right,
  sticky = true
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: sticky ? 'sticky' : 'static',
      top: 0,
      zIndex: 'var(--z-bar)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-3)',
      height: 60,
      padding: '0 var(--s-6)',
      background: 'var(--surface-1)',
      boxShadow: 'var(--e1), var(--edge)'
    }
  }, left, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), right);
}
function Crumb({
  items = []
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink)',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(Wordmark, {
    height: 19
  })), items.map((it, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-4)',
      fontSize: 15
    }
  }, "/"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 'var(--w-strong)',
      color: i === items.length - 1 ? 'var(--ink)' : 'var(--ink-3)',
      whiteSpace: 'nowrap'
    }
  }, it))));
}
const RAIL_GROUPS = [{
  cap: 'Content',
  items: [{
    icon: 'book',
    label: 'Articles',
    n: 45,
    key: 'library'
  }]
}, {
  cap: 'Your help center',
  items: [{
    icon: 'box',
    label: 'Product details'
  }, {
    icon: 'palette',
    label: 'Theming'
  }, {
    icon: 'external',
    label: 'View live site'
  }, {
    icon: 'globe',
    label: 'Domain'
  }, {
    icon: 'people',
    label: 'People'
  }]
}];
function Rail({
  current = 'library',
  onNav,
  runs
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      width: 'var(--rail)',
      flex: 'none',
      padding: 'var(--s-6) var(--s-3)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--s-6)'
    }
  }, RAIL_GROUPS.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.cap
  }, /*#__PURE__*/React.createElement(Micro, {
    style: {
      padding: '0 12px 8px'
    }
  }, g.cap), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 1
    }
  }, g.items.map(it => {
    const on = it.key === current;
    return /*#__PURE__*/React.createElement("button", {
      key: it.label,
      onClick: () => it.key && onNav && onNav(it.key),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        width: '100%',
        textAlign: 'left',
        height: 38,
        padding: '0 12px',
        borderRadius: 'var(--r-md)',
        fontSize: 15,
        fontWeight: on ? 'var(--w-strong)' : 'var(--w-medium)',
        color: on ? 'var(--ink)' : 'var(--ink-2)',
        background: on ? 'var(--surface-1)' : 'transparent',
        boxShadow: on ? 'var(--e1), var(--edge)' : 'none',
        transition: 'background var(--dur-2) var(--ease), color var(--dur-1) var(--ease)'
      },
      onMouseEnter: e => {
        if (!on) e.currentTarget.style.background = 'var(--hover)';
      },
      onMouseLeave: e => {
        if (!on) e.currentTarget.style.background = 'transparent';
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: on ? 'var(--brand)' : 'var(--ink-3)',
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: it.icon,
      size: 17
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, it.label), it.n != null && /*#__PURE__*/React.createElement("span", {
      className: "q-micro",
      style: {
        color: 'var(--ink-4)'
      }
    }, it.n));
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto',
      padding: '0 12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--rule)',
      margin: '0 -12px var(--s-4)'
    }
  }), /*#__PURE__*/React.createElement(Micro, null, "AI runs"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 6,
      fontSize: 15,
      color: 'var(--ink-2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--w-strong)',
      color: 'var(--ink)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, runs), " this cycle")));
}
Object.assign(window, {
  Bar,
  Crumb,
  Rail,
  ThemeToggle
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/AppShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Editor.jsx
try { (() => {
const {
  Micro,
  Button,
  IconButton,
  Icon,
  Card,
  Segmented,
  Menu,
  Notice,
  State,
  Thumb,
  Toolbar,
  Sheet
} = window.QuinkDesignSystem_6ae0bd;

// ============================================================================
// The editor — the North Star surface, and where v2's changes are most visible.
//
//  · The article title and every step heading are Newsreader. The canvas now reads like a
//    document you are writing, which is the entire product promise.
//  · The step number is a mono index under a 2px brand rule — the one motif kept from v1,
//    because it is genuinely good and it is in the live product.
//  · Step tools live in a raised cluster that fades in on hover, and they FADE OUT while the
//    selection toolbar is open (`q-quiet-tools`). That pairing is the fix for the toolbar
//    landing on top of other buttons.
//  · No borders on the rail or the bar. The rail is the page surface; the bar is raised.
// ============================================================================

function StepCard({
  n,
  step,
  active,
  onSelect
}) {
  const [confirm, setConfirm] = React.useState(false);
  return /*#__PURE__*/React.createElement("section", {
    id: 'step-' + n,
    style: {
      position: 'relative',
      paddingTop: 'var(--s-12)'
    },
    onMouseEnter: onSelect,
    className: "q-step"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--s-5)',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 'none',
      width: 26,
      paddingTop: 7,
      borderTop: '2px solid var(--brand)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "q-micro",
    style: {
      color: 'var(--brand)',
      fontWeight: 'var(--w-strong)'
    }
  }, String(n).padStart(2, '0'))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h3", {
    contentEditable: true,
    suppressContentEditableWarning: true,
    style: {
      fontSize: 'var(--t-d5)',
      outline: 'none',
      marginBottom: 'var(--s-3)'
    }
  }, step.h), /*#__PURE__*/React.createElement("p", {
    className: "q-prose",
    contentEditable: true,
    suppressContentEditableWarning: true,
    style: {
      outline: 'none',
      color: step.p ? 'var(--ink-2)' : 'var(--ink-4)'
    }
  }, step.p || 'Describe what happens in this step…'), step.p ? /*#__PURE__*/React.createElement("figure", {
    style: {
      marginTop: 'var(--s-6)',
      maxWidth: 560,
      position: 'relative'
    },
    onMouseEnter: e => {
      const o = e.currentTarget.querySelector('.shot-ov');
      if (o) o.style.opacity = 1;
    },
    onMouseLeave: e => {
      const o = e.currentTarget.querySelector('.shot-ov');
      if (o) o.style.opacity = 0;
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 'var(--r-lg)',
      overflow: 'hidden',
      boxShadow: 'var(--e2), var(--edge)'
    }
  }, /*#__PURE__*/React.createElement(Shot, {
    label: `step ${n} screenshot`
  })), /*#__PURE__*/React.createElement("div", {
    className: "shot-ov q-hovertools",
    style: {
      position: 'absolute',
      right: 10,
      bottom: 10,
      display: 'flex',
      gap: 4,
      opacity: 0,
      transition: 'opacity var(--dur-2) var(--ease)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "image"
  }, "Swap frame"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "pencil"
  }, "Annotate"))) : /*#__PURE__*/React.createElement(Notice, {
    style: {
      marginTop: 'var(--s-6)',
      maxWidth: 460
    },
    icon: "image",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm"
    }, "Pick a frame")
  }, "No screenshot yet."))), /*#__PURE__*/React.createElement("div", {
    className: "q-hovertools",
    style: {
      position: 'absolute',
      top: 'var(--s-10)',
      right: 0,
      display: 'flex',
      gap: 2,
      padding: 3,
      background: 'var(--surface-1)',
      borderRadius: 'var(--r-md)',
      boxShadow: 'var(--e2), var(--edge)',
      opacity: active ? 1 : 0,
      pointerEvents: active ? 'auto' : 'none',
      transition: 'opacity var(--dur-2) var(--ease)'
    }
  }, confirm ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'grid',
      placeItems: 'center',
      padding: '0 10px',
      fontSize: 13,
      color: 'var(--ink-2)'
    }
  }, "Delete step?"), /*#__PURE__*/React.createElement(Button, {
    variant: "critical",
    size: "sm"
  }, "Delete"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => setConfirm(false)
  }, "Cancel")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(IconButton, {
    icon: "grip",
    label: "Reorder",
    size: "sm"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "split",
    label: "Split step",
    size: "sm"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "merge",
    label: "Merge with previous",
    size: "sm"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "trash",
    label: "Delete step",
    size: "sm",
    tone: "critical",
    onClick: () => setConfirm(true)
  }))));
}
function Editor({
  onBack
}) {
  const [mode, setMode] = React.useState('Edit');
  const [active, setActive] = React.useState(1);
  const [pubMenu, setPubMenu] = React.useState(false);
  const [sel, setSel] = React.useState(null);
  const [hidden, setHidden] = React.useState(false);
  const [published, setPublished] = React.useState(false);
  const canvasRef = React.useRef(null);

  // Real selection driving a real toolbar. Selecting any text in the canvas measures the
  // range against the canvas box and hands the rect to <Toolbar>, which decides flip.
  React.useEffect(() => {
    const onUp = () => {
      const s = window.getSelection();
      const box = canvasRef.current;
      if (!s || s.isCollapsed || !box || !box.contains(s.anchorNode)) return setSel(null);
      const b = s.getRangeAt(0).getBoundingClientRect();
      if (!b.width) return setSel(null);
      const p = box.getBoundingClientRect();
      setSel({
        top: b.top - p.top,
        bottom: b.bottom - p.top,
        left: b.left - p.left,
        width: b.width
      });
    };
    document.addEventListener('selectionchange', onUp);
    return () => document.removeEventListener('selectionchange', onUp);
  }, []);

  // A demo of the real mechanism: while a selection toolbar is open the canvas carries
  // q-quiet-tools, so every hover-revealed control gets out of its way.
  const canvasCls = 'q-editor-canvas' + (sel ? ' q-quiet-tools' : '');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(Bar, {
    left: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      icon: "arrow-left",
      onClick: onBack
    }, "Help center"), /*#__PURE__*/React.createElement(Segmented, {
      options: ['Edit', 'Preview'],
      value: mode,
      onChange: setMode,
      style: {
        marginLeft: 8
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        gap: 2,
        marginLeft: 8
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      icon: "undo",
      label: "Undo"
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: "redo",
      label: "Redo",
      disabled: true
    }))),
    right: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(State, {
      state: published ? 'live' : 'edits',
      sub: published ? undefined : '1',
      style: {
        marginRight: 8
      }
    }), /*#__PURE__*/React.createElement(ThemeToggle, null), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'relative',
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: published ? 'secondary' : 'accent',
      onClick: () => setPublished(true),
      style: {
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0
      }
    }, published ? 'Published' : 'Publish changes'), /*#__PURE__*/React.createElement("button", {
      className: 'q-btn' + (published ? ' q-btn--secondary' : ' q-btn--accent'),
      onClick: () => setPubMenu(!pubMenu),
      "aria-label": "Publish options",
      style: {
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        padding: '0 10px',
        marginLeft: 1
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "chevron",
      size: 16
    })), pubMenu && /*#__PURE__*/React.createElement(Menu, {
      width: 330,
      style: {
        position: 'absolute',
        top: 'calc(100% + 8px)',
        right: 0,
        zIndex: 'var(--z-menu)'
      },
      items: [{
        type: 'group',
        label: 'This article'
      }, {
        label: 'Copy link',
        icon: 'link'
      }, {
        label: 'View live page',
        icon: 'external'
      }, {
        label: 'Change category',
        sub: 'Filed under Getting started.',
        icon: 'folder'
      }, {
        type: 'divider'
      }, {
        type: 'group',
        label: 'Who can find it'
      }, {
        label: 'Hide from search and browsing',
        sub: 'Stays live at its link. Removed from your help center’s search results and category pages.',
        icon: 'eye-off',
        switch: hidden,
        onToggle: setHidden
      }, {
        type: 'divider'
      }, {
        label: 'Discard unpublished edits',
        sub: 'Restores the published version. Can’t be undone.',
        icon: 'undo',
        critical: true
      }, {
        label: 'Unpublish',
        sub: 'Takes it off your help center. Keeps the content.',
        icon: 'eye-off',
        critical: true
      }, {
        label: 'Delete article',
        sub: 'The article and its recording go together.',
        icon: 'trash',
        critical: true
      }]
    })))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("nav", {
    style: {
      width: 'var(--rail-steps)',
      flex: 'none',
      padding: 'var(--s-6) var(--s-3)',
      overflow: 'auto'
    }
  }, /*#__PURE__*/React.createElement(Micro, {
    style: {
      padding: '0 10px 10px'
    }
  }, "Steps"), /*#__PURE__*/React.createElement("ol", {
    style: {
      listStyle: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: 1
    }
  }, ARTICLE.steps.map((s, i) => {
    const n = i + 1;
    const on = active === n;
    return /*#__PURE__*/React.createElement("li", {
      key: n
    }, /*#__PURE__*/React.createElement("a", {
      href: '#step-' + n,
      onClick: () => setActive(n),
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 11,
        padding: '9px 11px',
        borderRadius: 'var(--r-md)',
        textDecoration: 'none',
        background: on ? 'var(--surface-1)' : 'transparent',
        boxShadow: on ? 'var(--e1), var(--edge)' : 'none',
        transition: 'background var(--dur-2) var(--ease)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "q-micro",
      style: {
        width: 14,
        textAlign: 'right',
        color: on ? 'var(--brand)' : 'var(--ink-4)',
        flex: 'none'
      }
    }, n), s.shot && /*#__PURE__*/React.createElement(Thumb, {
      src: s.shot,
      active: on
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        minWidth: 0,
        fontSize: 13.5,
        lineHeight: 1.4,
        color: on ? 'var(--ink)' : 'var(--ink-3)',
        fontWeight: on ? 'var(--w-strong)' : 'var(--w-body)'
      }
    }, s.h)));
  })), /*#__PURE__*/React.createElement("button", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      marginTop: 'var(--s-3)',
      padding: '9px 10px',
      borderRadius: 'var(--r-md)',
      color: 'var(--ink-3)',
      fontSize: 14,
      fontWeight: 'var(--w-medium)'
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = 'var(--hover)';
      e.currentTarget.style.color = 'var(--ink)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = 'var(--ink-3)';
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 15
  }), " Add a step")), /*#__PURE__*/React.createElement("main", {
    className: canvasCls,
    style: {
      flex: 1,
      minWidth: 0,
      position: 'relative',
      overflow: 'auto',
      padding: 'var(--s-12) var(--gutter) var(--s-32)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--shell-prose)',
      margin: '0 auto',
      position: 'relative'
    },
    ref: canvasRef
  }, /*#__PURE__*/React.createElement("h1", {
    contentEditable: true,
    suppressContentEditableWarning: true,
    style: {
      fontSize: 'var(--t-d2)',
      letterSpacing: 'var(--tr-display-lg)',
      outline: 'none',
      maxWidth: 'var(--measure-title)'
    }
  }, ARTICLE.title), /*#__PURE__*/React.createElement("p", {
    className: "q-lede",
    contentEditable: true,
    suppressContentEditableWarning: true,
    style: {
      marginTop: 'var(--s-5)',
      outline: 'none'
    }
  }, ARTICLE.standfirst), /*#__PURE__*/React.createElement("button", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      marginTop: 'var(--s-8)',
      padding: '13px 16px',
      borderRadius: 'var(--r-md)',
      background: 'var(--surface-2)',
      color: 'var(--ink-2)',
      fontSize: 15,
      textAlign: 'left',
      transition: 'background var(--dur-2) var(--ease)'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'var(--brand-wash)',
    onMouseLeave: e => e.currentTarget.style.background = 'var(--surface-2)'
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--brand)',
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkle",
    size: 17
  })), "Change something across the whole guide"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--rule)',
      marginTop: 'var(--s-10)'
    }
  }), ARTICLE.steps.map((s, i) => /*#__PURE__*/React.createElement(StepCard, {
    key: i,
    n: i + 1,
    step: s,
    active: active === i + 1,
    onSelect: () => setActive(i + 1)
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 'var(--s-16)',
      fontSize: 13.5,
      color: 'var(--ink-3)',
      maxWidth: '58ch'
    }
  }, "Select any text on this page. The toolbar sits above every bar, flips below the selection near the top edge, and quiets the step tools while it is open."), sel && /*#__PURE__*/React.createElement(Toolbar, {
    rect: sel,
    items: [{
      icon: 'bold',
      label: 'Bold',
      on: true
    }, {
      icon: 'italic',
      label: 'Italic'
    }, {
      icon: 'link',
      label: 'Link'
    }, {
      type: 'divider'
    }, {
      icon: 'sparkle',
      label: 'Rewrite this'
    }]
  })))));
}
Object.assign(window, {
  Editor,
  StepCard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Editor.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Library.jsx
try { (() => {
const {
  Micro,
  Button,
  IconButton,
  Icon,
  Card,
  Input,
  Chip,
  Row,
  State,
  Group,
  Menu,
  Notice,
  AvatarStack
} = window.QuinkDesignSystem_6ae0bd;

// The article library. v2 changes:
//   · Folders are groups on the page, not cards inside cards.
//   · State appears only on rows that aren't the norm — a column of forty "Draft" pills was
//     the single biggest source of the generated feel.
//   · The filter chips select with an INK fill, so they don't compete with New article.
//   · The page title is the serif, with the counts as mono metadata beneath it.

function Library({
  onNew,
  onOpen
}) {
  const [filter, setFilter] = React.useState('All');
  const [menu, setMenu] = React.useState(false);
  const [q, setQ] = React.useState('');
  const match = a => (filter === 'All' || (filter === 'Live' ? a.state === 'live' || a.state === 'edits' : a.state === 'draft')) && (!q || a.title.toLowerCase().includes(q.toLowerCase()));
  const folders = FOLDERS.map(f => ({
    ...f,
    articles: f.articles.filter(match)
  }));
  const unfiled = UNFILED.filter(match);
  const total = FOLDERS.reduce((n, f) => n + f.articles.length, 0) + UNFILED.length;
  const live = [...FOLDERS.flatMap(f => f.articles), ...UNFILED].filter(a => a.state === 'live' || a.state === 'edits').length;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(Bar, {
    left: /*#__PURE__*/React.createElement(Crumb, {
      items: [KB.name]
    }),
    right: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(AvatarStack, {
      people: ['Priya Raman', 'Sam Okafor', 'Lee Chen', 'Dana Wu']
    }), /*#__PURE__*/React.createElement(ThemeToggle, null), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm"
    }, "Sign out"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      width: '100%',
      maxWidth: 'calc(var(--shell-app) + var(--rail) + var(--gutter) * 2)',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement(Rail, {
    current: "library",
    runs: KB.runs
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      minWidth: 0,
      padding: 'var(--s-10) var(--gutter) var(--s-24)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 'var(--s-6)',
      marginBottom: 'var(--s-8)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--t-d3)'
    }
  }, "All articles"), /*#__PURE__*/React.createElement(Micro, {
    style: {
      marginTop: 8
    }
  }, total, " articles \xB7 ", live, " live \xB7 2 folders")), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "folder-plus"
  }, "New folder"), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    icon: "plus",
    iconAfter: "chevron",
    onClick: () => setMenu(!menu)
  }, "New article"), menu && /*#__PURE__*/React.createElement(Menu, {
    width: 320,
    style: {
      position: 'absolute',
      top: 'calc(100% + 8px)',
      right: 0,
      zIndex: 'var(--z-menu)'
    },
    items: [{
      label: 'From a recording',
      sub: 'Drop in a screen recording and get a drafted guide.',
      icon: 'film',
      onClick: () => {
        setMenu(false);
        onNew();
      }
    }, {
      label: 'Write by hand',
      sub: 'Start from an empty article. Unlimited on every plan.',
      icon: 'pencil',
      onClick: () => setMenu(false)
    }]
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-3)',
      marginBottom: 'var(--s-8)'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    search: true,
    placeholder: "Search your articles\u2026",
    value: q,
    onChange: e => setQ(e.target.value),
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement(Chip, {
    on: filter === 'All',
    count: total,
    onClick: () => setFilter('All')
  }, "All"), /*#__PURE__*/React.createElement(Chip, {
    on: filter === 'Live',
    count: live,
    onClick: () => setFilter('Live')
  }, "Live"), /*#__PURE__*/React.createElement(Chip, {
    on: filter === 'Drafts',
    count: total - live,
    onClick: () => setFilter('Drafts')
  }, "Drafts"))), folders.map(f => /*#__PURE__*/React.createElement(Group, {
    key: f.name,
    name: f.name,
    count: `${f.articles.length} ${f.articles.length === 1 ? 'article' : 'articles'}`,
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(IconButton, {
      icon: "pencil",
      label: "Rename folder",
      size: "sm"
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: "dots",
      label: "More",
      size: "sm"
    })),
    empty: f.articles.length === 0 ? 'Nothing here matches that filter.' : undefined
  }, f.articles.map(a => /*#__PURE__*/React.createElement(Row, {
    key: a.title,
    onClick: onOpen,
    title: a.title,
    desc: a.desc,
    state: a.state !== 'draft' ? /*#__PURE__*/React.createElement(State, {
      state: a.state,
      sub: a.sub
    }) : undefined,
    meta: /*#__PURE__*/React.createElement(Micro, {
      as: "span",
      style: {
        flex: 'none'
      }
    }, a.steps, " steps \xB7 ", a.when),
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(IconButton, {
      icon: "external",
      label: "View live page",
      size: "sm"
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: "dots",
      label: "More",
      size: "sm"
    }))
  })))), /*#__PURE__*/React.createElement(Group, {
    name: "Unfiled",
    quiet: true,
    count: `${unfiled.length} articles`
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 12px 4px'
    }
  }, /*#__PURE__*/React.createElement(Notice, {
    tone: "caution"
  }, "These need a folder before they can go live \u2014 the folder is the category readers browse.")), unfiled.map(a => /*#__PURE__*/React.createElement(Row, {
    key: a.title,
    onClick: onOpen,
    title: a.title,
    desc: a.desc,
    meta: /*#__PURE__*/React.createElement(Micro, {
      as: "span",
      style: {
        flex: 'none'
      }
    }, a.steps, " steps \xB7 ", a.when),
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      icon: "folder"
    }, "File it"), /*#__PURE__*/React.createElement(IconButton, {
      icon: "dots",
      label: "More",
      size: "sm"
    }))
  }))))));
}
Object.assign(window, {
  Library
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Library.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Upload.jsx
try { (() => {
const {
  Wordmark,
  Micro,
  Button,
  IconButton,
  Icon,
  Card,
  Dropzone,
  Field,
  Input,
  Textarea,
  Select,
  Notice,
  Row,
  State,
  Progress,
  Thumb
} = window.QuinkDesignSystem_6ae0bd;

// ============================================================================
// The first ninety seconds. Two screens, one continuous surface.
//
// v2 changes three things here, and they are the whole difference:
//   · The serif headline. A 56px Newsreader line makes the upload screen read as the front
//     of a writing tool rather than a file picker.
//   · No dashed rectangle. The dropzone is an inset well with one lifted tile inside it.
//   · Generating is a real, determinate account of four named stages, with the recording
//     already visible. v1 showed a pulsing dot; v2 shows what is happening and to what.
// ============================================================================

function UploadScreen({
  onBack,
  onBuild
}) {
  const [file, setFile] = React.useState(null);
  const [over, setOver] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(Bar, {
    sticky: false,
    left: /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)'
      }
    }, /*#__PURE__*/React.createElement(Wordmark, {
      height: 20
    })),
    right: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ThemeToggle, null), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      icon: "arrow-left",
      onClick: onBack
    }, "Help center"))
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      width: '100%',
      maxWidth: 'var(--shell-form)',
      margin: '0 auto',
      padding: 'var(--s-16) var(--s-6) var(--s-24)'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--t-d2)',
      maxWidth: 'var(--measure-hero)',
      marginBottom: 'var(--s-5)'
    }
  }, "Turn a recording into a guide."), /*#__PURE__*/React.createElement("p", {
    className: "q-lede",
    style: {
      marginBottom: 'var(--s-12)'
    }
  }, "Drop in a screen recording and get an editable, publishable article in about ninety seconds \u2014 no writing, no screenshots to take."), !file ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Dropzone, {
    state: over ? 'over' : 'idle',
    sub: "MP4 or MOV \xB7 up to 100 MB and 6 minutes each",
    onClick: () => setFile({
      name: 'onboarding-flow.mp4',
      size: '38.2 MB',
      dur: '4:12'
    }),
    onDragOver: e => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: e => {
      e.preventDefault();
      setOver(false);
      setFile({
        name: 'onboarding-flow.mp4',
        size: '38.2 MB',
        dur: '4:12'
      });
    }
  }), /*#__PURE__*/React.createElement(Notice, {
    style: {
      marginTop: 'var(--s-4)'
    }
  }, COPY.freeLimit)) : /*#__PURE__*/React.createElement(Dropzone, {
    state: "loaded"
  }, /*#__PURE__*/React.createElement(Row, {
    thumb: /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'grid',
        placeItems: 'center',
        width: 44,
        height: 30,
        borderRadius: 'var(--r-xs)',
        background: 'var(--surface-1)',
        color: 'var(--brand)',
        boxShadow: 'var(--e1), var(--edge)',
        flex: 'none'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "film",
      size: 15
    })),
    title: file.name,
    desc: `${file.dur} · ${file.size}`,
    state: /*#__PURE__*/React.createElement(State, {
      state: "live",
      label: "Ready"
    }),
    arrow: false,
    actions: /*#__PURE__*/React.createElement(IconButton, {
      icon: "x",
      label: "Remove",
      size: "sm",
      onClick: () => setFile(null)
    })
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--s-12)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 'var(--s-3)',
      marginBottom: 'var(--s-5)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'var(--t-d5)'
    }
  }, "A little context"), /*#__PURE__*/React.createElement(Micro, {
    as: "span"
  }, "Optional, but it makes the draft better")), /*#__PURE__*/React.createElement(Card, {
    variant: "inset",
    pad: true,
    style: {
      marginBottom: 'var(--s-5)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-3)',
      padding: '14px 18px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--w-strong)',
      color: 'var(--ink)'
    }
  }, "Northwind"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-3)',
      fontSize: 15
    }
  }, "New users \xB7 Friendly"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm"
  }, "Change")), /*#__PURE__*/React.createElement(Field, {
    label: "What does this recording show?",
    optional: true,
    hint: "A specific answer gets a specific guide. Name the task, not the product."
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: COPY.recordingPlaceholder
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--s-5)',
      marginTop: 'var(--s-5)'
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Audience",
    optional: true
  }, /*#__PURE__*/React.createElement(Select, {
    options: ['New users', 'Existing customers', 'Internal team', 'Admins']
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Tone",
    optional: true
  }, /*#__PURE__*/React.createElement(Select, {
    options: ['Friendly', 'Concise', 'Formal']
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-4)',
      marginTop: 'var(--s-10)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    disabled: !file,
    onClick: onBuild
  }, COPY.buildCta), !file && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: 'var(--ink-3)'
    }
  }, "Add a recording and this opens.")))));
}

// ---------------------------------------------------------------------------
// Generating. The recording stays on screen, the four stages are named, and the progress
// rule is driven by the stage index — never by a timer pretending to be one.
// ---------------------------------------------------------------------------
function Generating({
  onDone
}) {
  const [stage, setStage] = React.useState(0);
  React.useEffect(() => {
    if (stage >= STAGES.length) {
      const t = setTimeout(onDone, 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStage(s => s + 1), 1500);
    return () => clearTimeout(t);
  }, [stage]);
  const done = stage >= STAGES.length;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(Bar, {
    sticky: false,
    left: /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)'
      }
    }, /*#__PURE__*/React.createElement(Wordmark, {
      height: 20
    })),
    right: /*#__PURE__*/React.createElement(ThemeToggle, null)
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      width: '100%',
      maxWidth: 560,
      margin: '0 auto',
      padding: 'var(--s-24) var(--s-6)'
    }
  }, /*#__PURE__*/React.createElement(Micro, {
    style: {
      marginBottom: 'var(--s-4)'
    }
  }, "onboarding-flow.mp4 \xB7 4:12"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--t-d3)',
      marginBottom: 'var(--s-3)'
    }
  }, done ? 'Your guide is ready.' : 'Writing your guide.'), /*#__PURE__*/React.createElement("p", {
    className: "q-lede",
    style: {
      marginBottom: 'var(--s-10)',
      fontSize: 17
    }
  }, done ? COPY.buildDone : COPY.generatingReassure), /*#__PURE__*/React.createElement(Progress, {
    value: Math.min(stage, STAGES.length) / STAGES.length,
    style: {
      marginBottom: 'var(--s-8)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--s-4)'
    }
  }, STAGES.map((s, i) => {
    const state = i < stage ? 'done' : i === stage ? 'now' : 'next';
    return /*#__PURE__*/React.createElement("div", {
      key: s.key,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-3)',
        opacity: state === 'next' ? 0.45 : 1,
        transition: 'opacity var(--dur-4) var(--ease)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'grid',
        placeItems: 'center',
        width: 22,
        height: 22,
        flex: 'none',
        color: state === 'done' ? 'var(--accent-600)' : state === 'now' ? 'var(--brand)' : 'var(--ink-4)'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: state === 'done' ? 'check-circle' : state === 'now' ? 'sparkle' : 'dot-circle',
      size: 19
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 16,
        fontWeight: state === 'now' ? 'var(--w-strong)' : 'var(--w-body)',
        color: state === 'next' ? 'var(--ink-3)' : 'var(--ink)'
      }
    }, s.label));
  })), /*#__PURE__*/React.createElement(Notice, {
    tone: "brand",
    icon: "sparkle",
    style: {
      marginTop: 'var(--s-10)'
    }
  }, COPY.generatingTip)));
}
Object.assign(window, {
  UploadScreen,
  Generating
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Upload.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/data.jsx
try { (() => {
// Demo content for the app kit. Copy follows the v1 rules that survived: second person,
// sentence case, concrete numbers, consequence named.
const COPY = {
  freeLimit: '3 free guides from video, kept 30 days. Writing by hand is unlimited.',
  buildCta: 'Build my guide',
  recordingPlaceholder: 'e.g. Connecting a Postgres read replica and running the first sync',
  generatingReassure: "Hang tight — you can't lose this.",
  generatingTip: "You'll be able to swap any screenshot and edit every step before publishing.",
  buildDone: 'Your guide is ready. Every step is editable now, and you can publish.'
};
const STAGES = [{
  key: 'analyzing',
  label: 'Analyzing your recording'
}, {
  key: 'detecting',
  label: 'Detecting each action'
}, {
  key: 'capturing',
  label: 'Capturing screenshots'
}, {
  key: 'writing',
  label: 'Writing your guide'
}];
const KB = {
  name: 'Northwind Help',
  domain: 'docs.northwind.com',
  runs: 44
};
const FOLDERS = [{
  name: 'Getting started',
  articles: [{
    title: 'Connect a Postgres read replica',
    desc: 'Point Northwind at a replica so syncs never touch production traffic.',
    steps: 8,
    when: '12 Mar',
    state: 'live'
  }, {
    title: 'Run your first sync',
    desc: 'Pick tables, set a schedule and watch the first run finish.',
    steps: 6,
    when: '9 Mar',
    state: 'edits',
    sub: '2'
  }, {
    title: 'Invite your team',
    desc: 'Add teammates and set what they can do.',
    steps: 4,
    when: '2 Mar',
    state: 'live'
  }, {
    title: 'A work in progress',
    desc: 'Still a draft.',
    steps: 3,
    when: '26d ago',
    state: 'draft'
  }]
}, {
  name: 'Syncs & schedules',
  articles: [{
    title: 'Change a sync schedule',
    desc: 'Hourly, daily, or a cron expression of your own.',
    steps: 5,
    when: '11 Mar',
    state: 'live'
  }, {
    title: 'Backfill a table',
    desc: 'Re-read history for one table without touching the others.',
    steps: 7,
    when: '4 Mar',
    state: 'draft'
  }]
}];
const UNFILED = [{
  title: 'How to create a playlist',
  desc: 'Follow these steps to start building your own collection.',
  steps: 5,
  when: '26d ago',
  state: 'draft'
}, {
  title: 'Fix a permissions error',
  desc: 'The grant Northwind needs, and how to confirm it landed.',
  steps: 4,
  when: '21h ago',
  state: 'draft'
}];
const ARTICLE = {
  title: 'Connect a Postgres read replica',
  standfirst: 'A replica keeps Northwind off your production traffic. This takes about five minutes and one grant.',
  steps: [{
    h: 'Open Sources in the sidebar',
    p: 'From any screen, click Sources. If you have never added one, the list is empty and the button reads Add your first source.'
  }, {
    h: 'Choose Postgres',
    p: 'Northwind connects to a replica the same way it connects to a primary — the difference is what you point it at, not which tile you pick.'
  }, {
    h: 'Paste the replica host',
    p: 'Use the replica endpoint, not the primary. On managed Postgres this usually ends in -ro or -replica.'
  }, {
    h: 'Create the read-only role',
    p: 'Run the grant Northwind shows you: GRANT SELECT ON ALL TABLES IN SCHEMA public TO northwind;'
  }, {
    h: 'Allow our IP range',
    p: 'Copy the two addresses on this panel into your database firewall. Syncs fail with a timeout until they are allowed.'
  }, {
    h: 'Test the connection',
    p: 'Click Test. A green result means Northwind can read the replica and see the tables you granted.'
  }, {
    h: 'Save the source',
    p: 'Saving does not start a sync. Pick tables and a schedule next.'
  }, {
    h: 'Untitled step',
    p: ''
  }]
};

// No real product frames were supplied, so every screenshot slot renders an honest
// placeholder rather than a drawn approximation of a UI.
function Shot({
  ratio = '16 / 10',
  label = 'screenshot',
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: ratio,
      background: 'var(--surface-2)',
      borderRadius: 'var(--r-md)',
      display: 'grid',
      placeItems: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "q-micro",
    style: {
      color: 'var(--ink-4)'
    }
  }, label));
}
Object.assign(window, {
  COPY,
  STAGES,
  KB,
  FOLDERS,
  UNFILED,
  ARTICLE,
  Shot
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/data.jsx", error: String((e && e.message) || e) }); }

// ui_kits/first-run/Arrival.jsx
try { (() => {
const {
  Wordmark,
  Micro,
  Button,
  IconButton,
  Icon,
  Card,
  Input,
  Notice,
  Menu,
  State
} = window.QuinkDesignSystem_6ae0bd;

// ============================================================================
// First run, screen 5: landing in the editor.
//
// Two kinds of question live here, and the difference matters:
//
//   1. CARRIED-OVER questions (OpenClarifications). The ones the run never got to ask —
//      over the cap, or skipped. They arrive as a card above the article, answerable in a
//      tap, and the answer lands as a diff on the step the question's evidence points at.
//      Same shape, same validated enum, just a later moment.
//
//   2. STEER. The question the USER asks. Every step has a field, and the field is
//      pre-filled after a run rather than blank: rerolling blindly is a slot machine,
//      editing the ask is steering. The result is shown as a diff with the instruction
//      quoted above it, so a result they don't recognise traces back to what they asked.
// ============================================================================

function OpenClarification({
  c,
  onAnswer,
  onDismiss
}) {
  return /*#__PURE__*/React.createElement(Card, {
    variant: "panel",
    pad: true,
    className: "q-fade-in",
    style: {
      marginBottom: 'var(--s-10)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--s-4)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(AiTag, null, "One thing I couldn\u2019t work out"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      margin: 'var(--s-4) 0 var(--s-3)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--ink-3)'
    }
  }, c.evidence), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--ink-4)'
    }
  }, "\xB7 ", c.at, " \xB7 step ", c.step)), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 19,
      lineHeight: 1.35,
      fontWeight: 'var(--w-strong)',
      letterSpacing: '-.012em',
      marginBottom: 'var(--s-5)'
    }
  }, c.question), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 'var(--s-2)'
    }
  }, c.options.map(o => /*#__PURE__*/React.createElement(Button, {
    key: o.id,
    size: "sm",
    variant: o.id === c.def ? 'primary' : 'secondary',
    onClick: onAnswer
  }, o.label))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13.5,
      color: 'var(--ink-3)',
      marginTop: 'var(--s-5)'
    }
  }, "Answering rewrites step ", c.step, " only. Nothing else moves.")), /*#__PURE__*/React.createElement(IconButton, {
    icon: "x",
    label: "Dismiss",
    size: "sm",
    onClick: onDismiss
  })));
}

// The question the user asks. Pre-filled, never a blind reroll.
function SteerField({
  value,
  onChange,
  onSubmit
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--s-2)',
      marginTop: 'var(--s-4)'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    value: value,
    onChange: e => onChange(e.target.value),
    placeholder: "Tell me what to change about this step\u2026",
    onKeyDown: e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmit();
      }
    },
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    icon: "sparkle",
    disabled: !value.trim(),
    onClick: onSubmit
  }, "Rewrite"));
}

// The answer, shown as a diff with the ask quoted above it.
function SteerResult({
  instruction,
  before,
  after,
  onKeep,
  onUndo
}) {
  return /*#__PURE__*/React.createElement(Card, {
    variant: "inset",
    pad: true,
    className: "q-fade-in",
    style: {
      marginTop: 'var(--s-4)',
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--ink-3)',
      fontStyle: 'italic',
      marginBottom: 'var(--s-4)'
    }
  }, "\u201C", instruction, "\u201D"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      color: 'var(--ink-4)',
      textDecoration: 'line-through',
      textDecorationColor: 'var(--critical)',
      marginBottom: 'var(--s-3)'
    }
  }, before), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      color: 'var(--ink)'
    }
  }, after), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-2)',
      marginTop: 'var(--s-5)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    onClick: onKeep
  }, "Keep it"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    onClick: onUndo
  }, "Undo"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--ink-3)'
    }
  }, "Not quite? Edit the ask and run it again.")));
}
function Arrival({
  onRestart
}) {
  const carried = FR_CLARIFICATIONS.find(c => !c.asked);
  const [open, setOpen] = React.useState(true);
  const [steerFor, setSteerFor] = React.useState(3);
  const [instruction, setInstruction] = React.useState('Drop the SQL and just say to run the grant it shows you');
  const [result, setResult] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(Bar, {
    left: /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        color: 'var(--ink)'
      }
    }, /*#__PURE__*/React.createElement(Wordmark, {
      height: 19
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-4)',
        fontSize: 15
      }
    }, "/"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 15,
        fontWeight: 'var(--w-strong)'
      }
    }, FR_ARTICLE.title), /*#__PURE__*/React.createElement(State, {
      state: "draft",
      label: "Draft"
    })),
    right: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ThemeToggle, null), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      icon: "eye"
    }, "Preview"), /*#__PURE__*/React.createElement(Button, {
      variant: "accent",
      icon: "arrow-up-circle"
    }, "Publish"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '232px 1fr',
      gap: 'var(--s-12)',
      maxWidth: 1280,
      width: '100%',
      margin: '0 auto',
      padding: 'var(--s-10) var(--s-10) var(--s-24)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("nav", {
    style: {
      position: 'sticky',
      top: 84,
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement(Micro, {
    style: {
      padding: '0 10px var(--s-3)'
    }
  }, "Steps"), FR_STEPS.map((s, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    onClick: () => setSteerFor(i),
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'baseline',
      textAlign: 'left',
      width: '100%',
      padding: '9px 10px',
      borderRadius: 'var(--r-md)',
      background: i === steerFor ? 'var(--surface-1)' : 'transparent',
      boxShadow: i === steerFor ? 'var(--e1), var(--edge)' : 'none',
      border: 0,
      cursor: 'pointer',
      font: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--ink-4)',
      flex: 'none'
    }
  }, String(i + 1).padStart(2, '0')), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: i === steerFor ? 'var(--ink)' : 'var(--ink-2)',
      fontWeight: i === steerFor ? 'var(--w-strong)' : 'var(--w-body)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, s.h)))), /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: 720
    }
  }, /*#__PURE__*/React.createElement(Notice, {
    tone: "brand",
    icon: "check-circle",
    style: {
      marginBottom: 'var(--s-8)'
    }
  }, "Your guide is ready. Every step is editable now \u2014 reword a line, swap a frame, or ask for a rewrite."), open && carried && /*#__PURE__*/React.createElement(OpenClarification, {
    c: carried,
    onAnswer: () => setOpen(false),
    onDismiss: () => setOpen(false)
  }), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--t-d3)',
      marginBottom: 'var(--s-4)'
    }
  }, FR_ARTICLE.title), /*#__PURE__*/React.createElement("p", {
    className: "q-lede",
    style: {
      marginBottom: 'var(--s-12)'
    }
  }, FR_ARTICLE.standfirst), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--s-10)'
    }
  }, FR_STEPS.map((s, i) => {
    const on = i === steerFor;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: 'flex',
        gap: 'var(--s-5)'
      }
    }, /*#__PURE__*/React.createElement(StepNum, {
      n: i + 1
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("h3", {
      style: {
        fontSize: 20,
        letterSpacing: '-.015em',
        marginBottom: 'var(--s-3)'
      }
    }, s.h), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 16,
        color: 'var(--ink-2)',
        maxWidth: 'var(--measure-prose)',
        marginBottom: 'var(--s-4)'
      }
    }, i === 3 && result ? 'Run the grant Northwind shows you — it is one line, and it gives us read access to nothing else.' : s.p), /*#__PURE__*/React.createElement(FrShot, {
      ratio: s.ratio,
      label: `frame at ${s.at}`
    }), on && !result && /*#__PURE__*/React.createElement(SteerField, {
      value: instruction,
      onChange: setInstruction,
      onSubmit: () => setResult(true)
    }), on && result && /*#__PURE__*/React.createElement(SteerResult, {
      instruction: instruction,
      before: "Run the grant Northwind shows you: GRANT SELECT ON ALL TABLES IN SCHEMA public TO northwind;",
      after: "Run the grant Northwind shows you \u2014 it is one line, and it gives us read access to nothing else.",
      onKeep: () => setResult(false),
      onUndo: () => setResult(false)
    })));
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13.5,
      color: 'var(--ink-3)',
      marginTop: 'var(--s-14)'
    }
  }, FR_COPY.retention), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    icon: "undo",
    onClick: onRestart,
    style: {
      marginTop: 'var(--s-6)'
    }
  }, "Replay the first run"))));
}
Object.assign(window, {
  Arrival,
  OpenClarification,
  SteerField,
  SteerResult
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/first-run/Arrival.jsx", error: String((e && e.message) || e) }); }

// ui_kits/first-run/Building.jsx
try { (() => {
const {
  Wordmark,
  Micro,
  Button,
  IconButton,
  Icon,
  Card,
  Input,
  Textarea,
  Notice,
  Progress,
  Chip
} = window.QuinkDesignSystem_6ae0bd;

// ============================================================================
// First run, screen 4: the article building up — and the questions.
//
// The whole design argument of this screen is in one sentence from the source:
// "Screenshots keep landing behind this panel; only the WRITE stage is waiting."
//
// So the layout is two columns and neither is a spinner. On the right the article is
// visibly assembling — eight step slots appear as soon as actions are detected, each one
// filling with its screenshot as it is captured, prose still bones. On the left, one
// question at a time. The user can see that answering is not holding up the machine; it is
// holding up the one stage that needs them, and the stage row says exactly that.
//
// THREE RULES CARRIED FROM ClarifyPanel.tsx:
//   1. Nothing blocks. The write button is present the whole time — "Skip the rest and
//      write it" while questions are open, "Write my guide" once they are done.
//   2. One question at a time, evidence first. A list of three is a form; one card with the
//      reason above it is a conversation.
//   3. Every word is a template with holes. The model supplies a type and slot values and
//      nothing else — a recording that could author its own question is a phishing vector.
// ============================================================================

function AiTag({
  children
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 10px 3px 8px',
      whiteSpace: 'nowrap',
      borderRadius: 999,
      background: 'var(--brand-tint)',
      color: 'var(--brand)',
      fontSize: 12.5,
      fontWeight: 'var(--w-strong)',
      letterSpacing: '.01em'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkle",
    size: 13
  }), children);
}
function StageRow({
  stage,
  paused
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-7)',
      flexWrap: 'wrap'
    }
  }, FR_STAGES.map((s, i) => {
    const st = i < stage ? 'done' : i === stage ? 'now' : 'next';
    const waiting = st === 'now' && paused;
    return /*#__PURE__*/React.createElement("div", {
      key: s.key,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        opacity: st === 'next' ? 0.42 : 1,
        transition: 'opacity var(--dur-4) var(--ease)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        color: st === 'done' ? 'var(--accent-600)' : waiting ? 'var(--caution-ink)' : st === 'now' ? 'var(--brand)' : 'var(--ink-4)'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: st === 'done' ? 'check-circle' : waiting ? 'clock' : st === 'now' ? 'sparkle' : 'dot-circle',
      size: 17
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14.5,
        fontWeight: st === 'now' ? 'var(--w-strong)' : 'var(--w-body)',
        color: st === 'next' ? 'var(--ink-3)' : 'var(--ink)'
      }
    }, waiting ? 'Waiting on your answers' : s.label));
  }));
}

// ---------------------------------------------------------------------------
// One question. Evidence first, default as the primary, fallback said out loud.
// ---------------------------------------------------------------------------
function QuestionCard({
  c,
  index,
  total,
  onAnswer
}) {
  const [typed, setTyped] = React.useState('');
  return /*#__PURE__*/React.createElement("div", {
    className: "q-fade-in"
  }, /*#__PURE__*/React.createElement(Micro, {
    style: {
      marginBottom: 'var(--s-3)'
    }
  }, index + 1, " of ", total), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 'var(--s-3)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--ink-3)'
    }
  }, c.evidence), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--ink-4)'
    }
  }, "\xB7 ", c.at)), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 19,
      lineHeight: 1.35,
      fontWeight: 'var(--w-strong)',
      letterSpacing: '-.012em',
      marginBottom: 'var(--s-5)'
    }
  }, c.question), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 'var(--s-2)'
    }
  }, c.options.map(o =>
  /*#__PURE__*/
  // The default is the primary. Not because it is more correct, but because it is
  // what happens if they walk away — the screen should agree with the machine.
  React.createElement(Button, {
    key: o.id,
    size: "sm",
    variant: o.id === c.def ? 'primary' : 'secondary',
    onClick: () => onAnswer(o.label)
  }, o.label)), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    onClick: () => onAnswer(null)
  }, "Not sure")), c.freeText && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--s-2)',
      marginTop: 'var(--s-4)'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Or your own word\u2026",
    value: typed,
    maxLength: 64,
    onChange: e => setTyped(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter' && typed.trim()) {
        e.preventDefault();
        onAnswer(typed.trim());
      }
    },
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    disabled: !typed.trim(),
    onClick: () => onAnswer(typed.trim())
  }, "Use")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13.5,
      color: 'var(--ink-3)',
      marginTop: 'var(--s-5)'
    }
  }, "Not sure? ", c.fallback, " You can change it later."));
}
function Answered({
  items,
  onChange
}) {
  if (!items.length) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 'var(--s-6)'
    }
  }, /*#__PURE__*/React.createElement(Micro, {
    style: {
      marginBottom: 'var(--s-3)'
    }
  }, "Answered"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--s-3)'
    }
  }, items.map(({
    c,
    i,
    value
  }) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 9
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      color: 'var(--accent-600)',
      paddingTop: 1,
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check-circle",
    size: 15
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      flex: 1,
      fontSize: 14.5,
      color: value === null ? 'var(--ink-3)' : 'var(--ink-2)'
    }
  }, value === null ? c.fallback : value), /*#__PURE__*/React.createElement("button", {
    onClick: () => onChange(i),
    style: {
      font: 'inherit',
      fontSize: 13.5,
      fontWeight: 'var(--w-strong)',
      color: 'var(--brand)',
      background: 'none',
      border: 0,
      cursor: 'pointer',
      padding: 0,
      flex: 'none'
    }
  }, "Change")))));
}

// ---------------------------------------------------------------------------
// The article, assembling. Step slots appear as actions are detected; each fills with its
// captured frame; prose lands last, one step at a time, because that is the real order.
// ---------------------------------------------------------------------------
function Assembling({
  shots,
  written,
  writing
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 720
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 'var(--s-10)'
    }
  }, written > 0 ? /*#__PURE__*/React.createElement("div", {
    className: "q-fade-in"
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--t-d3)',
      marginBottom: 'var(--s-4)'
    }
  }, FR_ARTICLE.title), /*#__PURE__*/React.createElement("p", {
    className: "q-lede"
  }, FR_ARTICLE.standfirst)) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 30,
      width: '62%',
      borderRadius: 8,
      background: 'var(--surface-3)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 13,
      width: '86%',
      borderRadius: 999,
      background: 'var(--surface-2)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--s-10)'
    }
  }, FR_STEPS.map((s, i) => {
    const captured = i < shots;
    const prose = i < written;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      className: captured ? 'q-fade-in' : undefined,
      style: {
        display: 'flex',
        gap: 'var(--s-5)',
        opacity: captured ? 1 : 0.45,
        transition: 'opacity var(--dur-5) var(--ease)'
      }
    }, /*#__PURE__*/React.createElement(StepNum, {
      n: i + 1,
      dim: !captured
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        marginBottom: 'var(--s-3)'
      }
    }, prose ? /*#__PURE__*/React.createElement("h3", {
      style: {
        fontSize: 20,
        letterSpacing: '-.015em'
      }
    }, s.h) : /*#__PURE__*/React.createElement("div", {
      style: {
        height: 14,
        width: 210,
        borderRadius: 999,
        background: 'var(--surface-3)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--ink-4)',
        flex: 'none'
      }
    }, s.at)), prose ? /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 16,
        color: 'var(--ink-2)',
        maxWidth: 'var(--measure-prose)',
        marginBottom: 'var(--s-4)'
      }
    }, s.p) : /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 'var(--s-4)'
      }
    }, /*#__PURE__*/React.createElement(Bones, {
      lines: 2
    })), /*#__PURE__*/React.createElement(FrShot, {
      ratio: s.ratio,
      label: captured ? `frame at ${s.at}` : 'capturing…'
    })));
  })), writing && /*#__PURE__*/React.createElement(Micro, {
    style: {
      marginTop: 'var(--s-8)'
    }
  }, "Writing step ", Math.min(written + 1, FR_STEPS.length), " of ", FR_STEPS.length));
}

// ---------------------------------------------------------------------------
// Screen 4, assembled.
// ---------------------------------------------------------------------------
function Building({
  onDone
}) {
  const asked = FR_CLARIFICATIONS.filter(c => c.asked);
  const [shots, setShots] = React.useState(0);
  const [answers, setAnswers] = React.useState({});
  const [note, setNote] = React.useState('');
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [writing, setWriting] = React.useState(false);
  const [written, setWritten] = React.useState(0);
  React.useEffect(() => {
    if (shots >= FR_STEPS.length) return;
    const t = setTimeout(() => setShots(s => s + 1), shots === 0 ? 450 : 620);
    return () => clearTimeout(t);
  }, [shots]);
  React.useEffect(() => {
    if (!writing) return;
    if (written >= FR_STEPS.length) {
      const t = setTimeout(onDone, 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setWritten(w => w + 1), 380);
    return () => clearTimeout(t);
  }, [writing, written]);
  const next = asked.findIndex((_, i) => !(i in answers));
  const current = next === -1 ? null : asked[next];
  const answeredList = asked.map((c, i) => ({
    c,
    i,
    value: answers[i]
  })).filter(({
    i
  }) => i in answers);
  const stage = writing ? 3 : shots >= FR_STEPS.length ? 3 : 2;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(Bar, {
    left: /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        color: 'var(--ink)'
      }
    }, /*#__PURE__*/React.createElement(Wordmark, {
      height: 19
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-4)',
        fontSize: 15
      }
    }, "/"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        color: 'var(--ink-3)'
      }
    }, FR_FILE.name, " \xB7 ", FR_FILE.dur)),
    right: /*#__PURE__*/React.createElement(ThemeToggle, null)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'sticky',
      top: 60,
      zIndex: 'var(--z-sticky)',
      background: 'var(--bg)',
      padding: 'var(--s-5) var(--s-10) var(--s-5)'
    }
  }, /*#__PURE__*/React.createElement(Progress, {
    value: writing ? (3 + written / FR_STEPS.length) / 4 : (2 + shots / FR_STEPS.length) / 4,
    style: {
      marginBottom: 'var(--s-5)'
    }
  }), /*#__PURE__*/React.createElement(StageRow, {
    stage: stage,
    paused: !writing
  })), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      display: 'grid',
      gridTemplateColumns: '380px 1fr',
      gap: 'var(--s-14)',
      alignItems: 'start',
      padding: '0 var(--s-10) var(--s-24)',
      maxWidth: 1360,
      width: '100%',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'sticky',
      top: 190
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "panel",
    pad: true
  }, writing ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(AiTag, null, "Writing your guide"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      color: 'var(--ink-2)',
      marginTop: 'var(--s-4)'
    }
  }, "Thanks \u2014 that is everything I needed. Every step is editable the moment it lands, and you can change any answer later.")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(AiTag, null, "I read your recording"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      color: 'var(--ink-2)',
      margin: 'var(--s-4) 0 var(--s-6)'
    }
  }, "Got ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--ink)',
      fontWeight: 'var(--w-strong)'
    }
  }, FR_STEPS.length, " steps"), ".", ' ', asked.length === 1 ? 'One thing I couldn’t work out on my own.' : `${asked.length} things I couldn’t work out on my own.`), /*#__PURE__*/React.createElement(Answered, {
    items: answeredList,
    onChange: i => setAnswers(p => {
      const n = {
        ...p
      };
      delete n[i];
      return n;
    })
  }), current ? /*#__PURE__*/React.createElement(QuestionCard, {
    key: next,
    c: current,
    index: next,
    total: asked.length,
    onAnswer: v => setAnswers(p => ({
      ...p,
      [next]: v
    }))
  }) : /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      color: 'var(--ink-2)'
    }
  }, "That\u2019s everything I needed."), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--rule)',
      margin: 'var(--s-7) 0 var(--s-5)'
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setNoteOpen(o => !o),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      font: 'inherit',
      fontSize: 14.5,
      fontWeight: 'var(--w-medium)',
      color: 'var(--ink-2)',
      background: 'none',
      border: 0,
      padding: 0,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron",
    size: 15,
    rotate: noteOpen ? 0 : -90
  }), "Anything else about this recording?"), noteOpen && /*#__PURE__*/React.createElement(Textarea, {
    rows: 3,
    value: note,
    onChange: e => setNote(e.target.value),
    maxLength: 600,
    placeholder: "Brand new feature \u2014 nobody has seen this screen before.",
    style: {
      marginTop: 'var(--s-4)'
    }
  }), /*#__PURE__*/React.createElement(Button, {
    full: true,
    size: "lg",
    variant: current ? 'secondary' : 'primary',
    onClick: () => setWriting(true),
    style: {
      marginTop: 'var(--s-6)'
    }
  }, current ? 'Skip the rest and write it' : 'Write my guide'), shots < FR_STEPS.length && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13.5,
      color: 'var(--ink-3)',
      marginTop: 'var(--s-4)',
      textAlign: 'center'
    }
  }, "Screenshots are still capturing \u2014 ", shots, " of ", FR_STEPS.length, ". Take your time.")))), /*#__PURE__*/React.createElement(Assembling, {
    shots: shots,
    written: written,
    writing: writing
  })));
}
Object.assign(window, {
  Building,
  AiTag,
  Assembling,
  QuestionCard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/first-run/Building.jsx", error: String((e && e.message) || e) }); }

// ui_kits/first-run/Signup.jsx
try { (() => {
const {
  Wordmark,
  Micro,
  Button,
  IconButton,
  Icon,
  Card,
  Dropzone,
  Field,
  Input,
  Notice,
  Row,
  State,
  Chip
} = window.QuinkDesignSystem_6ae0bd;

// ============================================================================
// First run, screens 1–3: drop → wall → check your email.
//
// The one structural thing this kit exists to show: THE WALL FIRES AFTER UPLOAD AND BEFORE
// GENERATION (ux-spec §2, LOCKED). The expensive pipeline never runs for an unverified
// session. That costs conversion only while signup stays feather-light, so the wall is one
// tap, no card, no password, and it never stops reminding you your recording is already
// loaded and waiting on the other side.
//
// A first-run upload screen is NOT the returning-author one: there is no help center yet,
// so there is no KB context card and no folder picker. What replaces them is disclosure —
// the free-tier limit and the retention promise, both said before the file is committed.
// ============================================================================

function FrUpload({
  onBuild
}) {
  const [file, setFile] = React.useState(null);
  const [over, setOver] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(Bar, {
    sticky: false,
    left: /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)'
      }
    }, /*#__PURE__*/React.createElement(Wordmark, {
      height: 20
    })),
    right: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ThemeToggle, null), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost"
    }, "Sign in"))
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      width: '100%',
      maxWidth: 'var(--shell-form)',
      margin: '0 auto',
      padding: 'var(--s-16) var(--s-6) var(--s-24)'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--t-d2)',
      maxWidth: 'var(--measure-hero)',
      marginBottom: 'var(--s-5)'
    }
  }, "Turn a recording into a guide."), /*#__PURE__*/React.createElement("p", {
    className: "q-lede",
    style: {
      marginBottom: 'var(--s-12)'
    }
  }, "Drop in a screen recording and get an editable, publishable article in about ninety seconds \u2014 no writing, no screenshots to take."), !file ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Dropzone, {
    state: over ? 'over' : 'idle',
    sub: "MP4 or MOV \xB7 up to 100 MB and 6 minutes each",
    onClick: () => setFile(FR_FILE),
    onDragOver: e => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: e => {
      e.preventDefault();
      setOver(false);
      setFile(FR_FILE);
    }
  }), /*#__PURE__*/React.createElement(Notice, {
    style: {
      marginTop: 'var(--s-4)'
    }
  }, FR_COPY.freeLimit)) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Dropzone, {
    state: "loaded"
  }, /*#__PURE__*/React.createElement(Row, {
    thumb: /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'grid',
        placeItems: 'center',
        width: 44,
        height: 30,
        borderRadius: 'var(--r-xs)',
        background: 'var(--surface-1)',
        color: 'var(--brand)',
        boxShadow: 'var(--e1), var(--edge)',
        flex: 'none'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "film",
      size: 15
    })),
    title: file.name,
    desc: `${file.dur} · ${file.size}`,
    state: /*#__PURE__*/React.createElement(State, {
      state: "live",
      label: "Ready"
    }),
    arrow: false,
    actions: /*#__PURE__*/React.createElement(IconButton, {
      icon: "x",
      label: "Remove",
      size: "sm",
      onClick: () => setFile(null)
    })
  })), /*#__PURE__*/React.createElement(Notice, {
    icon: "clock",
    style: {
      marginTop: 'var(--s-4)'
    }
  }, FR_COPY.retention)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--s-12)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 'var(--s-3)',
      marginBottom: 'var(--s-5)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'var(--t-d5)'
    }
  }, "A little context"), /*#__PURE__*/React.createElement(Micro, {
    as: "span"
  }, "Optional, but it makes the draft better")), /*#__PURE__*/React.createElement(Field, {
    label: "What does this recording show?",
    optional: true,
    hint: "A specific answer gets a specific guide. Name the task, not the product."
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: FR_COPY.recordingPlaceholder
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-4)',
      marginTop: 'var(--s-10)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    disabled: !file,
    onClick: onBuild
  }, FR_COPY.buildCta), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: 'var(--ink-3)'
    }
  }, file ? 'One tap to sign in, then it starts building.' : 'Add a recording and this opens.')))));
}

// ---------------------------------------------------------------------------
// The wall. An OPEN padlock — unlocking, not blocking — and the file pill, because the
// only anxiety on this screen is "did my recording survive this".
// ---------------------------------------------------------------------------
const GoogleG = () => /*#__PURE__*/React.createElement("svg", {
  width: "17",
  height: "17",
  viewBox: "0 0 48 48",
  "aria-hidden": true,
  style: {
    flex: 'none'
  }
}, /*#__PURE__*/React.createElement("path", {
  fill: "#4285F4",
  d: "M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z"
}), /*#__PURE__*/React.createElement("path", {
  fill: "#34A853",
  d: "M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z"
}), /*#__PURE__*/React.createElement("path", {
  fill: "#FBBC05",
  d: "M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5C3 17.1 2.1 20.4 2.1 24s.9 6.9 2.4 9.9l7.3-5.7z"
}), /*#__PURE__*/React.createElement("path", {
  fill: "#EA4335",
  d: "M24 10.4c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.4 12.2-9.4z"
}));
function WallShell({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)'
    }
  }, /*#__PURE__*/React.createElement(Bar, {
    sticky: false,
    left: /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)'
      }
    }, /*#__PURE__*/React.createElement(Wordmark, {
      height: 20
    })),
    right: /*#__PURE__*/React.createElement(ThemeToggle, null)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'grid',
      placeItems: 'center',
      padding: 'var(--s-12) var(--s-6)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "q-fade-in",
    style: {
      width: '100%',
      maxWidth: 420
    }
  }, children)));
}
function AccountWall({
  onSent,
  onGoogle
}) {
  const [email, setEmail] = React.useState('');
  return /*#__PURE__*/React.createElement(WallShell, null, /*#__PURE__*/React.createElement(Card, {
    pad: "lg"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'grid',
      placeItems: 'center',
      width: 44,
      height: 44,
      borderRadius: 'var(--r-md)',
      background: 'var(--brand-tint)',
      color: 'var(--brand)',
      marginBottom: 'var(--s-5)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "lock",
    size: 19
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'var(--t-d4)',
      marginBottom: 'var(--s-2)'
    }
  }, FR_COPY.wallHeading), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      color: 'var(--ink-2)',
      marginBottom: 'var(--s-6)'
    }
  }, FR_COPY.wallNoCard), /*#__PURE__*/React.createElement(Chip, {
    style: {
      marginBottom: 'var(--s-7)'
    }
  }, FR_COPY.wallFilePill, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--ink-3)',
      marginLeft: 8
    }
  }, FR_FILE.size)), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg",
    full: true,
    onClick: onGoogle,
    style: {
      marginBottom: 'var(--s-5)'
    }
  }, /*#__PURE__*/React.createElement(GoogleG, null), "Continue with Google"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-4)',
      margin: '0 0 var(--s-5)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      height: 1,
      background: 'var(--rule)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "q-micro"
  }, "or"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      height: 1,
      background: 'var(--rule)'
    }
  })), /*#__PURE__*/React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      if (email.trim()) onSent(email.trim());
    }
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "you@company.com",
    value: email,
    onChange: e => setEmail(e.target.value),
    style: {
      marginBottom: 'var(--s-3)'
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "lg",
    full: true,
    type: "submit",
    disabled: !email.trim()
  }, "Email me a link")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--ink-3)',
      marginTop: 'var(--s-6)'
    }
  }, FR_COPY.wallFootnote)));
}
function CheckEmail({
  email,
  onOpen
}) {
  return /*#__PURE__*/React.createElement(WallShell, null, /*#__PURE__*/React.createElement(Card, {
    pad: "lg"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'grid',
      placeItems: 'center',
      width: 44,
      height: 44,
      borderRadius: 'var(--r-md)',
      background: 'var(--accent-50)',
      color: 'var(--accent-700)',
      marginBottom: 'var(--s-5)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "link",
    size: 19
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'var(--t-d4)',
      marginBottom: 'var(--s-2)'
    }
  }, "Check your email"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      color: 'var(--ink-2)'
    }
  }, "We sent a sign-in link to ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--ink)',
      fontWeight: 'var(--w-strong)'
    }
  }, email), ". Open it and your guide starts building."), /*#__PURE__*/React.createElement(Notice, {
    icon: "film",
    style: {
      marginTop: 'var(--s-6)'
    }
  }, FR_FILE.name, " is held on this device until you land back here. Nothing has been uploaded yet."), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    full: true,
    onClick: onOpen,
    style: {
      marginTop: 'var(--s-6)'
    }
  }, "Open the link")));
}
Object.assign(window, {
  FrUpload,
  AccountWall,
  CheckEmail
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/first-run/Signup.jsx", error: String((e && e.message) || e) }); }

// ui_kits/first-run/firstRunData.jsx
try { (() => {
// First-run kit data. Every user-facing sentence here is either copied verbatim from
// web/src/lib/config.ts (COPY.wall*) and web/src/lib/clarifications.ts (EVIDENCE /
// QUESTION / FALLBACK templates), or written to those templates with this recording's
// slot values filled in. Nothing here is invented voice.

const FR_COPY = {
  freeLimit: '3 free guides from video, kept 30 days. Writing by hand is unlimited.',
  buildCta: 'Build my guide',
  recordingPlaceholder: 'e.g. Connecting a Postgres read replica and running the first sync',
  wallHeading: 'Create a free account to build your guide.',
  wallNoCard: 'Free accounts include 3 video guides, no card needed.',
  wallFilePill: '✓ your recording is ready',
  wallFootnote: 'Keeps the free tier free for everyone.',
  retention: 'We keep your recording for 30 days so you can check the guide against it, then we delete it.'
};
const FR_FILE = {
  name: 'replica-setup.mov',
  size: '38.2 MB',
  dur: '4:12'
};
const FR_STAGES = [{
  key: 'analyzing',
  label: 'Analyzing your recording'
}, {
  key: 'detecting',
  label: 'Detecting each action'
}, {
  key: 'capturing',
  label: 'Capturing screenshots'
}, {
  key: 'writing',
  label: 'Writing your guide'
}];

// The eight actions the pipeline detected. `at` is the timestamp in the recording — it is
// what the step spine shows before any prose exists, and what makes the wait legible.
const FR_STEPS = [{
  at: '0:03',
  h: 'Open Sources in the sidebar',
  p: 'From any screen, click Sources. If you have never added one, the list is empty and the button reads Add your first source.',
  ratio: '16 / 10'
}, {
  at: '0:21',
  h: 'Choose Postgres',
  p: 'Northwind connects to a replica the same way it connects to a primary — the difference is what you point it at, not which tile you pick.',
  ratio: '16 / 10'
}, {
  at: '0:42',
  h: 'Paste the replica host',
  p: 'Use the replica endpoint, not the primary. On managed Postgres this usually ends in -ro or -replica.',
  ratio: '16 / 9'
}, {
  at: '1:16',
  h: 'Create the read-only role',
  p: 'Run the grant Northwind shows you: GRANT SELECT ON ALL TABLES IN SCHEMA public TO northwind;',
  ratio: '16 / 9'
}, {
  at: '1:54',
  h: 'Allow our IP range',
  p: 'Copy the two addresses on this panel into your database firewall. Syncs fail with a timeout until they are allowed.',
  ratio: '16 / 10'
}, {
  at: '2:18',
  h: 'Test the connection',
  p: 'Click Test connection. A green result means Northwind can read the replica and see the tables you granted.',
  ratio: '16 / 10'
}, {
  at: '2:47',
  h: 'Save the source',
  p: 'Saving does not start a sync. Pick tables and a schedule next.',
  ratio: '16 / 10'
}, {
  at: '3:05',
  h: 'Pick tables and a schedule',
  p: 'Choose the tables you want and how often they refresh. Hourly is the default.',
  ratio: '16 / 9'
}];
const FR_ARTICLE = {
  title: 'Connect a Postgres read replica',
  standfirst: 'A replica keeps Northwind off your production traffic. This takes about five minutes and one grant.'
};

// The four clarification types the enum allows, each with this recording's slots.
// `asked` = raised during the run (the pause). The rest are carried into the editor as
// open clarifications — the questions the run never got to.
const FR_CLARIFICATIONS = [{
  type: 'variable_value',
  asked: true,
  at: '0:42',
  step: 3,
  evidence: 'Typed into “Host”',
  question: 'Should readers type “northwind-ro.eu-west-1.rds.amazonaws.com” too, or their own?',
  options: [{
    id: 'own',
    label: 'Their own value'
  }, {
    id: 'exact',
    label: 'This exact value'
  }],
  def: 'own',
  fallback: 'I’ll treat it as their own value.'
}, {
  type: 'missing_prerequisite',
  asked: true,
  at: '0:03',
  step: 1,
  evidence: 'The recording starts part-way in',
  question: 'Readers won’t start where you did — the replica was already provisioned. Mention it?',
  options: [{
    id: 'add',
    label: 'Add it as a prerequisite'
  }, {
    id: 'omit',
    label: 'Leave it out'
  }],
  def: 'add',
  fallback: 'I’ll leave it out.'
}, {
  type: 'element_name',
  asked: true,
  at: '2:18',
  step: 6,
  evidence: 'A control I couldn’t read: the blue button, top right',
  question: 'What is the blue button, top right called?',
  options: [{
    id: 'test',
    label: 'Test connection'
  }, {
    id: 'save',
    label: 'Save source'
  }],
  def: 'test',
  freeText: true,
  fallback: 'I’ll describe it by what it does.'
}, {
  type: 'flow_split',
  asked: false,
  at: '3:05',
  step: 8,
  evidence: 'The recording changes tack here',
  question: 'This looks like two things: connecting the replica, then scheduling the first sync. One guide, or two?',
  options: [{
    id: 'one',
    label: 'Keep it as one guide'
  }, {
    id: 'two',
    label: 'Split into two'
  }],
  def: 'one',
  fallback: 'I’ll keep it as one guide.'
}];

// No real product frames were supplied, so every screenshot slot is an honest placeholder.
function FrShot({
  ratio = '16 / 10',
  label,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: ratio,
      background: 'var(--surface-2)',
      borderRadius: 'var(--r-md)',
      display: 'grid',
      placeItems: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "q-micro",
    style: {
      color: 'var(--ink-4)'
    }
  }, label));
}

// The step-number motif: a 26px column, 2px brand top rule, mono tabular index. The one
// v1 shape kept unchanged, because it is what makes an author recognise their own article
// on the published site.
function StepNum({
  n,
  dim
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 26,
      flex: 'none',
      paddingTop: 2,
      opacity: dim ? 0.4 : 1,
      transition: 'opacity var(--dur-4) var(--ease)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 2,
      background: 'var(--brand)',
      borderRadius: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 8,
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      fontVariantNumeric: 'tabular-nums',
      color: 'var(--ink-3)'
    }
  }, String(n).padStart(2, '0')));
}

// Skeleton prose. One slow sweep on arrival, never a loop.
function Bones({
  lines = 3
}) {
  const w = ['92%', '78%', '54%', '84%'];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 9
    }
  }, Array.from({
    length: lines
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      height: i === 0 ? 13 : 10,
      width: w[i % 4],
      borderRadius: 999,
      background: 'var(--surface-3)'
    }
  })));
}
Object.assign(window, {
  FR_COPY,
  FR_FILE,
  FR_STAGES,
  FR_STEPS,
  FR_ARTICLE,
  FR_CLARIFICATIONS,
  FrShot,
  StepNum,
  Bones
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/first-run/firstRunData.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/MarketingHome.jsx
try { (() => {
const {
  Wordmark,
  Micro,
  ThemeToggle,
  Button,
  Icon,
  Card,
  Sheet,
  Field,
  Input,
  Notice,
  State
} = window.QuinkDesignSystem_6ae0bd;

// The landing page, at v2. The hero is a 76px Newsreader line — the single change that most
// separates this from a template. No dashed boxes, no bordered cards, no eyebrow pill.

const STEPS = [{
  n: 'Record',
  title: 'Record your screen',
  body: 'Do the workflow you already know cold — .mp4 or .mov, no narration required.'
}, {
  n: 'Edit',
  title: 'Get an editable article',
  body: 'Headings, steps and a screenshot per action, drafted for you. Fix a frame, reword a line.'
}, {
  n: 'Publish',
  title: 'Publish to your domain',
  body: 'It goes live on your own hosted, searchable help center — the one your customers actually read.'
}];
function Nav({
  onLogin
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 'var(--z-bar)',
      background: 'color-mix(in oklab, var(--bg) 88%, transparent)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-6)',
      maxWidth: 'var(--shell)',
      margin: '0 auto',
      padding: 'var(--s-5) var(--gutter)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink)'
    }
  }, /*#__PURE__*/React.createElement(Wordmark, {
    height: 22
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-2)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    href: "#how"
  }, "How it works"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    href: "#pricing"
  }, "Pricing"), /*#__PURE__*/React.createElement(ThemeToggle, null), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    onClick: onLogin
  }, "Log in"))));
}
function Hero({
  onStart
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: 'var(--shell)',
      margin: '0 auto',
      padding: 'var(--s-24) var(--gutter) var(--s-20)'
    }
  }, /*#__PURE__*/React.createElement(Micro, {
    style: {
      marginBottom: 'var(--s-6)'
    }
  }, "For the support & ops teams who write the docs"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--t-d1)',
      maxWidth: 'var(--measure-hero)',
      letterSpacing: 'var(--tr-display-lg)',
      lineHeight: 'var(--lh-display)',
      marginBottom: 'var(--s-7)'
    }
  }, "The week of article-writing you never have to do."), /*#__PURE__*/React.createElement("p", {
    className: "q-lede",
    style: {
      marginBottom: 'var(--s-10)'
    }
  }, "Record your screen once. Quink turns it into a polished, step-by-step help article \u2014 published straight to your own branded help center at ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.88em',
      color: 'var(--ink)'
    }
  }, "docs.yourcompany.com"), "."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-5)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    onClick: onStart
  }, "Build my guide"), /*#__PURE__*/React.createElement(State, {
    state: "live",
    label: "Free to try",
    sub: "3 guides from video \xB7 no card"
  })));
}
function HowItWorks() {
  return /*#__PURE__*/React.createElement("section", {
    id: "how",
    style: {
      maxWidth: 'var(--shell)',
      margin: '0 auto',
      padding: '0 var(--gutter) var(--s-24)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--rule)',
      marginBottom: 'var(--s-14)'
    }
  }), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'var(--t-d3)',
      maxWidth: '20ch',
      marginBottom: 'var(--s-12)'
    }
  }, "Three steps. About ninety seconds."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 'var(--s-6)'
    }
  }, STEPS.map((s, i) => /*#__PURE__*/React.createElement(Card, {
    key: s.title,
    pad: "lg"
  }, /*#__PURE__*/React.createElement(Micro, {
    style: {
      marginBottom: 'var(--s-8)'
    }
  }, String(i + 1).padStart(2, '0'), " \xB7 ", s.n), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 'var(--t-d5)',
      marginBottom: 'var(--s-3)'
    }
  }, s.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      color: 'var(--ink-3)',
      lineHeight: 1.6
    }
  }, s.body)))));
}
function Pricing() {
  return /*#__PURE__*/React.createElement("section", {
    id: "pricing",
    style: {
      maxWidth: 'var(--shell)',
      margin: '0 auto',
      padding: '0 var(--gutter) var(--s-24)'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "panel",
    pad: "lg",
    style: {
      display: 'flex',
      gap: 'var(--s-12)',
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 280
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'var(--t-d4)',
      marginBottom: 'var(--s-3)'
    }
  }, "Writing by hand is always free."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      color: 'var(--ink-2)',
      maxWidth: '52ch'
    }
  }, "Generation is the only thing that costs us anything, so it's the only thing we meter. Your whole team is included on every plan \u2014 there are no per-seat fees.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--s-3)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg"
  }, "Build my guide"), /*#__PURE__*/React.createElement(Notice, null, "3 free guides from video, kept 30 days."))));
}
function LegalFooter() {
  const links = ['Terms', 'Privacy', 'Refunds', 'Contact'];
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--surface-1)',
      boxShadow: 'var(--e1), var(--edge)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--shell)',
      margin: '0 auto',
      padding: 'var(--s-7) var(--gutter)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-6)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-3)'
    }
  }, /*#__PURE__*/React.createElement(Wordmark, {
    height: 18
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      gap: 'var(--s-6)'
    }
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    style: {
      fontSize: 14,
      color: 'var(--ink-3)'
    }
  }, l)))));
}
function LoginSheet({
  onClose
}) {
  return /*#__PURE__*/React.createElement(Sheet, {
    icon: "lock",
    title: "Log in to Quink",
    lede: "We'll email you a link \u2014 there's no password to remember.",
    onClose: onClose,
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, null, "Send me a link"), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: onClose
    }, "Cancel"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--s-6)'
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Work email"
  }, /*#__PURE__*/React.createElement(Input, {
    type: "email",
    placeholder: "you@company.com"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-4)',
      margin: 'var(--s-5) 0',
      color: 'var(--ink-4)',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      height: 1,
      background: 'var(--rule)'
    }
  }), "or", /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      height: 1,
      background: 'var(--rule)'
    }
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    full: true,
    icon: "globe"
  }, "Continue with Google")));
}
function MarketingHome() {
  const [login, setLogin] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh'
    }
  }, /*#__PURE__*/React.createElement(Nav, {
    onLogin: () => setLogin(true)
  }), /*#__PURE__*/React.createElement(Hero, {
    onStart: () => {
      window.location.href = '../app/index.html';
    }
  }), /*#__PURE__*/React.createElement(HowItWorks, null), /*#__PURE__*/React.createElement(Pricing, null), /*#__PURE__*/React.createElement(LegalFooter, null), login && /*#__PURE__*/React.createElement(LoginSheet, {
    onClose: () => setLogin(false)
  }));
}
Object.assign(window, {
  MarketingHome,
  Nav,
  Hero,
  HowItWorks,
  Pricing,
  LegalFooter,
  LoginSheet
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/MarketingHome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/reader/ReaderChrome.jsx
try { (() => {
const {
  Wordmark,
  Micro,
  ThemeToggle,
  Button,
  IconButton,
  Icon,
  Card,
  Input,
  Row,
  Group,
  Thumb
} = window.QuinkDesignSystem_6ae0bd;

// ============================================================================
// The published help center. Same chassis as the authoring app — same surface ladder, same
// elevation, same type — with --brand swapped for the customer's colour. That shared
// chassis is the "both should feel connected" answer: a reader page and an editor page are
// recognisably the same product, and only the accent tells you whose site you're on.
//
// The masthead band is ONE surface containing mark, search and headline — never a white
// strip above a hero. v1's four band treatments collapse to two here (solid and deep),
// because the tinted variants went grey for desaturated customer colours.
// ============================================================================

function Band({
  compact = false,
  q,
  setQ,
  results,
  onOpen,
  onHome
}) {
  const [open, setOpen] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    className: "q-on-brand",
    style: {
      position: 'relative',
      background: 'var(--brand)',
      color: 'var(--on-brand)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--shell)',
      margin: '0 auto',
      padding: compact ? 'var(--s-5) var(--gutter)' : 'var(--s-6) var(--gutter) var(--s-16)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-5)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onHome,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 13,
      color: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'grid',
      placeItems: 'center',
      width: compact ? 34 : 42,
      height: compact ? 34 : 42,
      borderRadius: 'var(--r-md)',
      background: 'var(--surface-1)',
      color: 'var(--brand)',
      fontFamily: 'var(--font-display)',
      fontSize: compact ? 18 : 22,
      fontWeight: 500,
      boxShadow: 'var(--e2)',
      flex: 'none'
    }
  }, KB.glyph), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: compact ? 20 : 24,
      fontWeight: 500,
      letterSpacing: 'var(--tr-display)'
    }
  }, KB.name)), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), compact && /*#__PURE__*/React.createElement(BandSearch, {
    q: q,
    setQ: setQ,
    results: results,
    onOpen: onOpen,
    open: open,
    setOpen: setOpen,
    width: 320
  }), /*#__PURE__*/React.createElement(ThemeToggle, null)), !compact && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", {
    style: {
      color: 'inherit',
      fontSize: 'var(--t-d2)',
      maxWidth: 'var(--measure-hero)',
      marginTop: 'var(--s-12)',
      letterSpacing: 'var(--tr-display-lg)'
    }
  }, KB.headline), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 'var(--s-4)',
      fontSize: 18,
      lineHeight: 1.5,
      maxWidth: '46ch',
      color: 'color-mix(in oklab, var(--on-brand) 88%, transparent)'
    }
  }, KB.sub), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--s-8)',
      maxWidth: 540
    }
  }, /*#__PURE__*/React.createElement(BandSearch, {
    q: q,
    setQ: setQ,
    results: results,
    onOpen: onOpen,
    open: open,
    setOpen: setOpen,
    big: true
  })))));
}

// The search field sits ON the brand fill, so it can't use the app's field tokens — it
// derives its own from --on-brand, which is itself WCAG-picked. That is the one place the
// reader needs colour logic the app doesn't.
function BandSearch({
  q,
  setQ,
  results,
  onOpen,
  open,
  setOpen,
  big = false,
  width
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: width || '100%',
      flex: width ? 'none' : undefined
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: big ? 18 : 14,
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'color-mix(in oklab, var(--on-brand) 68%, transparent)',
      pointerEvents: 'none',
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: big ? 19 : 16
  })), /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => {
      setQ(e.target.value);
      setOpen(true);
    },
    onFocus: () => setOpen(true),
    onBlur: () => setTimeout(() => setOpen(false), 120),
    placeholder: "Search the help center",
    className: "q-band-field",
    style: {
      width: '100%',
      height: big ? 52 : 38,
      paddingLeft: big ? 50 : 40,
      paddingRight: 18,
      borderRadius: 'var(--r-pill)',
      border: 'none',
      background: 'color-mix(in oklab, var(--on-brand) 12%, transparent)',
      color: 'var(--on-brand)',
      fontSize: big ? 16 : 14.5,
      outline: 'none',
      transition: 'background var(--dur-2) var(--ease), box-shadow var(--dur-2) var(--ease)'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'color-mix(in oklab, var(--on-brand) 18%, transparent)',
    onMouseLeave: e => e.currentTarget.style.background = 'color-mix(in oklab, var(--on-brand) 12%, transparent)'
  }), open && q && /*#__PURE__*/React.createElement("div", {
    className: "q-menu",
    style: {
      position: 'absolute',
      top: 'calc(100% + 10px)',
      left: 0,
      right: 0,
      zIndex: 'var(--z-menu)',
      color: 'var(--ink)',
      minWidth: 0
    }
  }, results.length === 0 ? /*#__PURE__*/React.createElement("p", {
    style: {
      padding: '14px 12px',
      fontSize: 14,
      color: 'var(--ink-3)'
    }
  }, "Nothing matches \u201C", q, "\u201D.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-4)',
      fontSize: 13
    }
  }, "Try a word from the task you're trying to finish.")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", {
    className: "q-menu-cap"
  }, results.length, " ", results.length === 1 ? 'result' : 'results'), results.slice(0, 5).map(r => /*#__PURE__*/React.createElement("button", {
    key: r.id,
    className: "q-menu-it",
    onMouseDown: () => onOpen(r)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, r.title, /*#__PURE__*/React.createElement("small", null, r.cat, " \xB7 ", r.steps, " steps")))))));
}
function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      marginTop: 'var(--s-24)',
      background: 'var(--surface-1)',
      boxShadow: 'var(--e1), var(--edge)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--shell)',
      margin: '0 auto',
      padding: 'var(--s-7) var(--gutter)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-6)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Micro, {
    as: "span"
  }, KB.domain), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13.5,
      color: 'var(--ink-3)'
    }
  }, "Made with ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-2)'
    }
  }, /*#__PURE__*/React.createElement(Wordmark, {
    height: 15
  })))));
}
Object.assign(window, {
  Band,
  BandSearch,
  Footer
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/reader/ReaderChrome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/reader/ReaderScreens.jsx
try { (() => {
const {
  Micro,
  Button,
  IconButton,
  Icon,
  Card,
  Row,
  Group,
  Thumb,
  Notice,
  State
} = window.QuinkDesignSystem_6ae0bd;

// ---------------------------------------------------------------------------
// Home: the band, then categories as groups of rows. v1 used a 216px sticky heading rail
// beside each category; v2 drops it — the sticky column was solving a scanning problem that
// larger type and more space solve better, and it cost half the width on every list.
// ---------------------------------------------------------------------------
function ReaderHome({
  onOpen,
  onCategory
}) {
  return /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: 'var(--shell)',
      margin: '0 auto',
      padding: 'var(--s-16) var(--gutter) 0'
    }
  }, CATEGORIES.map(c => /*#__PURE__*/React.createElement(Group, {
    key: c.id,
    name: c.name,
    count: `${c.articles.length} articles`,
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      iconAfter: "chevron-right",
      onClick: () => onCategory(c)
    }, "See all"),
    style: {
      marginBottom: 'var(--s-12)'
    }
  }, c.articles.map(a => /*#__PURE__*/React.createElement(Row, {
    key: a.id,
    onClick: () => onOpen(a),
    title: a.title,
    desc: a.desc,
    meta: /*#__PURE__*/React.createElement(Micro, {
      as: "span",
      style: {
        flex: 'none'
      }
    }, a.steps, " steps")
  })))));
}

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------
function ReaderCategory({
  category,
  onOpen,
  onHome
}) {
  return /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: 'var(--shell)',
      margin: '0 auto',
      padding: 'var(--s-12) var(--gutter) 0'
    }
  }, /*#__PURE__*/React.createElement(Crumbs, {
    items: [{
      label: KB.name,
      onClick: onHome
    }, {
      label: category.name
    }]
  }), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--t-d3)',
      marginTop: 'var(--s-5)'
    }
  }, category.name), /*#__PURE__*/React.createElement("p", {
    className: "q-lede",
    style: {
      marginTop: 'var(--s-3)',
      marginBottom: 'var(--s-10)'
    }
  }, category.desc), /*#__PURE__*/React.createElement(Card, {
    style: {
      padding: 6,
      maxWidth: 860
    }
  }, category.articles.map(a => /*#__PURE__*/React.createElement(Row, {
    key: a.id,
    onClick: () => onOpen(a),
    title: a.title,
    desc: a.desc,
    meta: /*#__PURE__*/React.createElement(Micro, {
      as: "span",
      style: {
        flex: 'none'
      }
    }, a.steps, " steps \xB7 ", a.updated)
  }))));
}
function Crumbs({
  items
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      flexWrap: 'wrap'
    }
  }, items.map((it, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-4)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 14
  })), it.onClick ? /*#__PURE__*/React.createElement("button", {
    onClick: it.onClick,
    style: {
      fontSize: 13.5,
      color: 'var(--ink-3)'
    }
  }, it.label) : /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13.5,
      color: 'var(--ink-2)'
    }
  }, it.label))));
}

// ---------------------------------------------------------------------------
// Article. The step spine, the serif title, the 68ch measure — and the step number motif
// carried over from the editor, so an author recognises their own article on the live site.
// ---------------------------------------------------------------------------
function ReaderArticle({
  article,
  onHome,
  onCategory
}) {
  const [active, setActive] = React.useState(1);
  const [vote, setVote] = React.useState(null);
  React.useEffect(() => {
    const io = new IntersectionObserver(entries => {
      const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(Number(vis.target.dataset.step));
    }, {
      rootMargin: '-15% 0px -70% 0px'
    });
    document.querySelectorAll('[data-step]').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [article.id]);
  return /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: 'var(--shell)',
      margin: '0 auto',
      padding: 'var(--s-12) var(--gutter) 0'
    }
  }, /*#__PURE__*/React.createElement(Crumbs, {
    items: [{
      label: KB.name,
      onClick: onHome
    }, {
      label: article.category,
      onClick: onCategory
    }, {
      label: article.title
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'var(--rail-spine) minmax(0, 1fr)',
      gap: 'var(--s-16)',
      marginTop: 'var(--s-8)'
    },
    className: "rd-grid"
  }, /*#__PURE__*/React.createElement("nav", {
    style: {
      position: 'sticky',
      top: 'var(--s-6)',
      alignSelf: 'start',
      maxHeight: 'calc(100vh - 48px)',
      overflow: 'auto'
    },
    className: "rd-spine"
  }, /*#__PURE__*/React.createElement(Micro, {
    style: {
      marginBottom: 'var(--s-4)'
    }
  }, "On this page"), /*#__PURE__*/React.createElement("ol", {
    style: {
      listStyle: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: 1
    }
  }, article.steps.map((s, i) => {
    const n = i + 1;
    const on = active === n;
    return /*#__PURE__*/React.createElement("li", {
      key: n
    }, /*#__PURE__*/React.createElement("a", {
      href: '#s' + n,
      style: {
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        padding: '6px 8px',
        borderRadius: 'var(--r-sm)',
        textDecoration: 'none',
        background: on ? 'var(--brand-tint)' : 'transparent',
        transition: 'background var(--dur-2) var(--ease)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "q-micro",
      style: {
        width: 12,
        textAlign: 'right',
        color: on ? 'var(--brand)' : 'var(--ink-4)',
        flex: 'none'
      }
    }, n), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        lineHeight: 1.35,
        color: on ? 'var(--ink)' : 'var(--ink-3)',
        fontWeight: on ? 'var(--w-strong)' : 'var(--w-body)'
      }
    }, s.h)));
  }))), /*#__PURE__*/React.createElement("article", {
    style: {
      minWidth: 0,
      paddingBottom: 'var(--s-16)'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--t-d2)',
      maxWidth: 'var(--measure-title)',
      letterSpacing: 'var(--tr-display-lg)'
    }
  }, article.title), /*#__PURE__*/React.createElement("p", {
    className: "q-lede",
    style: {
      marginTop: 'var(--s-5)',
      fontSize: 20
    }
  }, article.standfirst), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--s-5)',
      marginTop: 'var(--s-6)'
    }
  }, article.meta.map(m => /*#__PURE__*/React.createElement(Micro, {
    key: m,
    as: "span"
  }, m))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--rule)',
      marginTop: 'var(--s-8)'
    }
  }), article.steps.map((s, i) => {
    const n = i + 1;
    const tall = s.shape === 'tall';
    return /*#__PURE__*/React.createElement("section", {
      key: n,
      id: 's' + n,
      "data-step": n,
      style: {
        paddingTop: 'var(--s-12)',
        scrollMarginTop: 'var(--s-6)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 'var(--s-5)',
        alignItems: 'flex-start'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 'none',
        width: 26,
        paddingTop: 7,
        borderTop: '2px solid var(--brand)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "q-micro",
      style: {
        color: 'var(--brand)',
        fontWeight: 'var(--w-strong)'
      }
    }, String(n).padStart(2, '0'))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 'var(--t-d5)',
        marginBottom: 'var(--s-3)'
      }
    }, s.h), /*#__PURE__*/React.createElement("div", {
      style: tall ? {
        display: 'flex',
        gap: 'var(--s-8)',
        alignItems: 'flex-start'
      } : undefined,
      className: tall ? 'rd-stack' : undefined
    }, /*#__PURE__*/React.createElement("p", {
      className: "q-prose",
      style: tall ? {
        flex: 1,
        minWidth: 0,
        maxWidth: '46ch'
      } : undefined,
      dangerouslySetInnerHTML: {
        __html: s.p
      }
    }), /*#__PURE__*/React.createElement("figure", {
      style: {
        flex: 'none',
        marginTop: tall ? 0 : 'var(--s-6)',
        width: tall ? 268 : '100%',
        maxWidth: tall ? 268 : 780,
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--e2), var(--edge)'
      }
    }, /*#__PURE__*/React.createElement(Shot, {
      shape: s.shape,
      label: `step ${n}`
    }))))));
  }), /*#__PURE__*/React.createElement(Card, {
    pad: true,
    style: {
      marginTop: 'var(--s-16)',
      maxWidth: 'var(--measure-prose)'
    }
  }, vote === null && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-5)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 'var(--t-d6)',
      flex: 1
    }
  }, "Did this get you there?"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--s-2)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    onClick: () => setVote('yes')
  }, "Yes"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    onClick: () => setVote('no')
  }, "Not quite"))), vote === 'yes' && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      color: 'var(--ink-2)'
    }
  }, "Good \u2014 thanks for saying so."), vote === 'no' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 'var(--t-d6)',
      marginBottom: 'var(--s-3)'
    }
  }, "What was missing?"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--s-2)'
    }
  }, /*#__PURE__*/React.createElement("input", {
    className: "q-input",
    placeholder: "The step where I got stuck\u2026",
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    onClick: () => setVote('yes')
  }, "Send")))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--s-14)',
      maxWidth: 860
    }
  }, /*#__PURE__*/React.createElement(Micro, {
    style: {
      marginBottom: 'var(--s-3)'
    }
  }, "Next in ", article.category), /*#__PURE__*/React.createElement(Card, {
    style: {
      padding: 6
    }
  }, CATEGORIES.find(c => c.id === article.categoryId).articles.filter(a => a.id !== article.id).map(a => /*#__PURE__*/React.createElement(Row, {
    key: a.id,
    href: "#",
    title: a.title,
    desc: a.desc,
    meta: /*#__PURE__*/React.createElement(Micro, {
      as: "span",
      style: {
        flex: 'none'
      }
    }, a.steps, " steps")
  })))))));
}
Object.assign(window, {
  ReaderHome,
  ReaderCategory,
  ReaderArticle,
  Crumbs
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/reader/ReaderScreens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/reader/readerData.jsx
try { (() => {
// Per-KB theming — the reader's one real constraint: THE PRIMARY COLOUR IS THE ONLY THING
// STORED. Every brand shade is mixed from it at render, so a customer picking one hex moves
// the band, links, tints, step rules and hover fills together.
//
// The v1 logic is preserved verbatim in spirit (WCAG-measured on-colour, oklab mixes); what
// changed is that it now writes into the v2 token names, so the reader and the authoring app
// are literally the same chassis with a different --brand.
const DEEP = 'oklch(16% 0.008 60)';
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// White or warm near-black, whichever actually reads on this fill. A hardcoded white is
// right for teal and wrong for amber, which is why this is measured rather than assumed.
function onColor(hex) {
  const l = luminance(hex);
  return contrast(l, 1) >= contrast(l, 0.02) ? 'oklch(99% 0.004 0)' : 'oklch(19% 0.008 60)';
}
function themeVars(c) {
  const lighter = p => `color-mix(in oklab, ${c} ${100 - p}%, white)`;
  const darker = p => `color-mix(in oklab, ${c} ${100 - p}%, black)`;
  return {
    '--brand': c,
    '--brand-50': lighter(93),
    '--brand-100': lighter(84),
    '--brand-200': lighter(66),
    '--brand-300': lighter(46),
    '--brand-400': lighter(26),
    '--brand-500': darker(8),
    '--brand-600': c,
    '--brand-700': darker(17),
    '--brand-800': darker(32),
    '--brand-900': darker(52),
    '--brand-tint': `color-mix(in oklab, ${c} 9%, var(--bg))`,
    '--brand-wash': `color-mix(in oklab, ${c} 4.5%, var(--bg))`,
    '--brand-press': `color-mix(in oklab, ${c} 86%, ${DEEP})`,
    '--brand-ring': `color-mix(in oklab, ${c} 34%, transparent)`,
    '--brand-mark': `color-mix(in oklab, ${c} 17%, var(--surface-1))`,
    '--brand-deep': `color-mix(in oklab, ${c} 26%, ${DEEP})`,
    '--on-brand': onColor(c),
    '--on-deep': 'oklch(97% 0.004 205)'
  };
}
const KB = {
  name: 'Northwind Help',
  glyph: 'N',
  color: '#1f6e6b',
  headline: 'How can we help?',
  sub: 'Guides for connecting Northwind to your warehouse, inviting your team, and keeping syncs healthy.',
  domain: 'docs.northwind.com'
};
const CATEGORIES = [{
  id: 'getting-started',
  name: 'Getting started',
  desc: 'From an empty account to a first finished sync.',
  articles: [{
    id: 'read-replica',
    title: 'Connect a Postgres read replica',
    desc: 'Point Northwind at a replica so syncs never touch production traffic.',
    steps: 8,
    updated: '12 Mar'
  }, {
    id: 'first-sync',
    title: 'Run your first sync',
    desc: 'Pick tables, set a schedule and watch the first run finish.',
    steps: 6,
    updated: '9 Mar'
  }, {
    id: 'invite-team',
    title: 'Invite your team',
    desc: 'Everyone on your plan is included — there are no per-seat fees.',
    steps: 4,
    updated: '2 Mar'
  }]
}, {
  id: 'syncs',
  name: 'Syncs & schedules',
  desc: 'Changing what runs, and when.',
  articles: [{
    id: 'schedule',
    title: 'Change a sync schedule',
    desc: 'Hourly, daily, or a cron expression of your own.',
    steps: 5,
    updated: '11 Mar'
  }, {
    id: 'backfill',
    title: 'Backfill a table',
    desc: 'Re-read history for one table without touching the others.',
    steps: 7,
    updated: '4 Mar'
  }]
}, {
  id: 'troubleshooting',
  name: 'Troubleshooting',
  desc: 'What to check, in the order worth checking it.',
  articles: [{
    id: 'stuck-sync',
    title: 'A sync is stuck on "queued"',
    desc: 'Four things to rule out before you write in.',
    steps: 6,
    updated: '14 Mar'
  }, {
    id: 'permissions',
    title: 'Fix a permissions error',
    desc: 'The grant Northwind needs, and how to confirm it landed.',
    steps: 4,
    updated: '7 Mar'
  }]
}];
const ARTICLE = {
  id: 'read-replica',
  category: 'Getting started',
  categoryId: 'getting-started',
  title: 'Connect a Postgres read replica',
  standfirst: 'A replica keeps Northwind off your production traffic. This takes about five minutes and one grant.',
  meta: ['8 steps', 'Updated 12 Mar'],
  steps: [{
    h: 'Open Sources in the sidebar',
    p: 'From any screen, click <b>Sources</b>. If you have never added one, the list is empty and the button reads <b>Add your first source</b>.',
    shape: 'wide'
  }, {
    h: 'Choose Postgres',
    p: 'Northwind connects to a replica the same way it connects to a primary — the difference is what you point it at, not which tile you pick.',
    shape: 'tall'
  }, {
    h: 'Paste the replica host',
    p: 'Use the replica endpoint, not the primary. On managed Postgres this usually ends in <code>-ro</code> or <code>-replica</code>.',
    shape: 'wide'
  }, {
    h: 'Create the read-only role',
    p: 'Run the grant Northwind shows you: <code>GRANT SELECT ON ALL TABLES IN SCHEMA public TO northwind;</code>',
    shape: 'wide'
  }, {
    h: 'Allow our IP range',
    p: 'Copy the two addresses on this panel into your database firewall. Syncs fail with a timeout until they are allowed.',
    shape: 'tall'
  }, {
    h: 'Test the connection',
    p: 'Click <b>Test</b>. A green result means Northwind can read the replica and can see the tables you granted.',
    shape: 'wide'
  }, {
    h: 'Save the source',
    p: 'Saving does not start a sync. Pick tables and a schedule next — see <a href="#">Run your first sync</a>.',
    shape: 'wide'
  }, {
    h: 'Check the first run',
    p: 'The run appears in <b>Activity</b> within a minute. A finished run shows the row count it read.',
    shape: 'wide'
  }]
};
const ALL = CATEGORIES.flatMap(c => c.articles.map(a => ({
  ...a,
  cat: c.name,
  catId: c.id
})));

// No real product frames were supplied, so screenshot slots are honest placeholders rather
// than a drawn approximation of somebody's UI.
function Shot({
  shape = 'wide',
  label = 'screenshot'
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: shape === 'tall' ? '3 / 4' : '16 / 10',
      background: 'var(--surface-2)',
      display: 'grid',
      placeItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "q-micro",
    style: {
      color: 'var(--ink-4)'
    }
  }, label));
}
Object.assign(window, {
  themeVars,
  KB,
  CATEGORIES,
  ARTICLE,
  ALL,
  Shot
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/reader/readerData.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Bolt = __ds_scope.Bolt;

__ds_ns.Micro = __ds_scope.Micro;

__ds_ns.ThemeToggle = __ds_scope.ThemeToggle;

__ds_ns.BOLT_PATH = __ds_scope.BOLT_PATH;

__ds_ns.Wordmark = __ds_scope.Wordmark;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.ICON_NAMES = __ds_scope.ICON_NAMES;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Segmented = __ds_scope.Segmented;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.AvatarStack = __ds_scope.AvatarStack;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Group = __ds_scope.Group;

__ds_ns.Progress = __ds_scope.Progress;

__ds_ns.Row = __ds_scope.Row;

__ds_ns.State = __ds_scope.State;

__ds_ns.Thumb = __ds_scope.Thumb;

__ds_ns.Menu = __ds_scope.Menu;

__ds_ns.Notice = __ds_scope.Notice;

__ds_ns.Sheet = __ds_scope.Sheet;

__ds_ns.Toolbar = __ds_scope.Toolbar;

__ds_ns.Dropzone = __ds_scope.Dropzone;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Textarea = __ds_scope.Textarea;

})();
