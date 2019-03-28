// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview This file defines a singleton which provides access to all data
 * that is available as soon as the page's resources are loaded (before DOM
 * content has finished loading). This data includes both localized strings and
 * any data that is important to have ready from a very early stage (e.g. things
 * that must be displayed right away).
 *
 * Note that loadTimeData is not guaranteed to be consistent between page
 * refreshes (https://crbug.com/740629) and should not contain values that might
 * change if the page is re-opened later.
 */

/**
 * @typedef {{
 *   substitutions: (Array<string>|undefined),
 *   attrs: (Object<function(Node, string):boolean>|undefined),
 *   tags: (Array<string>|undefined),
 * }}
 */
var SanitizeInnerHtmlOpts;

/** @type {!LoadTimeData} */
var loadTimeData;

// Expose this type globally as a temporary work around until
// https://github.com/google/closure-compiler/issues/544 is fixed.
/** @constructor */
function LoadTimeData() {}

(function() {
    'use strict';

    LoadTimeData.prototype = {
        /**
         * Sets the backing object.
         *
         * Note that there is no getter for |data_| to discourage abuse of the form:
         *
         *     var value = loadTimeData.data()['key'];
         *
         * @param {Object} value The de-serialized page data.
         */
        set data(value) {
            expect(!this.data_, 'Re-setting data.');
            this.data_ = value;
        },

        /**
         * Returns a JsEvalContext for |data_|.
         * @returns {JsEvalContext}
         */
        createJsEvalContext: function() {
            return new JsEvalContext(this.data_);
        },

        /**
         * @param {string} id An ID of a value that might exist.
         * @return {boolean} True if |id| is a key in the dictionary.
         */
        valueExists: function(id) {
            return id in this.data_;
        },

        /**
         * Fetches a value, expecting that it exists.
         * @param {string} id The key that identifies the desired value.
         * @return {*} The corresponding value.
         */
        getValue: function(id) {
            expect(this.data_, 'No data. Did you remember to include strings.js?');
            var value = this.data_[id];
            expect(typeof value != 'undefined', 'Could not find value for ' + id);
            return value;
        },

        /**
         * As above, but also makes sure that the value is a string.
         * @param {string} id The key that identifies the desired string.
         * @return {string} The corresponding string value.
         */
        getString: function(id) {
            var value = this.getValue(id);
            expectIsType(id, value, 'string');
            return /** @type {string} */ (value);
        },

        /**
         * Returns a formatted localized string where $1 to $9 are replaced by the
         * second to the tenth argument.
         * @param {string} id The ID of the string we want.
         * @param {...(string|number)} var_args The extra values to include in the
         *     formatted output.
         * @return {string} The formatted string.
         */
        getStringF: function(id, var_args) {
            var value = this.getString(id);
            if (!value)
                return '';

            var args = Array.prototype.slice.call(arguments);
            args[0] = value;
            return this.substituteString.apply(this, args);
        },

        /**
         * Make a string safe for use with with Polymer bindings that are
         * inner-h-t-m-l (or other innerHTML use).
         * @param {string} rawString The unsanitized string.
         * @param {SanitizeInnerHtmlOpts=} opts Optional additional allowed tags and
         *     attributes.
         * @return {string}
         */
        sanitizeInnerHtml: function(rawString, opts) {
            opts = opts || {};
            return parseHtmlSubset('<b>' + rawString + '</b>', opts.tags, opts.attrs)
                .firstChild.innerHTML;
        },

        /**
         * Returns a formatted localized string where $1 to $9 are replaced by the
         * second to the tenth argument. Any standalone $ signs must be escaped as
         * $$.
         * @param {string} label The label to substitute through.
         *     This is not an resource ID.
         * @param {...(string|number)} var_args The extra values to include in the
         *     formatted output.
         * @return {string} The formatted string.
         */
        substituteString: function(label, var_args) {
            var varArgs = arguments;
            return label.replace(/\$(.|$|\n)/g, function(m) {
                assert(m.match(/\$[$1-9]/), 'Unescaped $ found in localized string.');
                return m == '$$' ? '$' : varArgs[m[1]];
            });
        },

        /**
         * Returns a formatted string where $1 to $9 are replaced by the second to
         * tenth argument, split apart into a list of pieces describing how the
         * substitution was performed. Any standalone $ signs must be escaped as $$.
         * @param {string} label A localized string to substitute through.
         *     This is not an resource ID.
         * @param {...(string|number)} var_args The extra values to include in the
         *     formatted output.
         * @return {!Array<!{value: string, arg: (null|string)}>} The formatted
         *     string pieces.
         */
        getSubstitutedStringPieces: function(label, var_args) {
            var varArgs = arguments;
            // Split the string by separately matching all occurrences of $1-9 and of
            // non $1-9 pieces.
            var pieces = (label.match(/(\$[1-9])|(([^$]|\$([^1-9]|$))+)/g) || []).map(function(p) {
                // Pieces that are not $1-9 should be returned after replacing $$
                // with $.
                if (!p.match(/^\$[1-9]$/)) {
                    assert(
                        (p.match(/\$/g) || []).length % 2 == 0,
                        'Unescaped $ found in localized string.');
                    return {
                        value: p.replace(/\$\$/g, '$'),
                        arg: null
                    };
                }

                // Otherwise, return the substitution value.
                return {
                    value: varArgs[p[1]],
                    arg: p
                };
            });

            return pieces;
        },

        /**
         * As above, but also makes sure that the value is a boolean.
         * @param {string} id The key that identifies the desired boolean.
         * @return {boolean} The corresponding boolean value.
         */
        getBoolean: function(id) {
            var value = this.getValue(id);
            expectIsType(id, value, 'boolean');
            return /** @type {boolean} */ (value);
        },

        /**
         * As above, but also makes sure that the value is an integer.
         * @param {string} id The key that identifies the desired number.
         * @return {number} The corresponding number value.
         */
        getInteger: function(id) {
            var value = this.getValue(id);
            expectIsType(id, value, 'number');
            expect(value == Math.floor(value), 'Number isn\'t integer: ' + value);
            return /** @type {number} */ (value);
        },

        /**
         * Override values in loadTimeData with the values found in |replacements|.
         * @param {Object} replacements The dictionary object of keys to replace.
         */
        overrideValues: function(replacements) {
            expect(
                typeof replacements == 'object',
                'Replacements must be a dictionary object.');
            for (var key in replacements) {
                this.data_[key] = replacements[key];
            }
        }
    };

    /**
     * Checks condition, displays error message if expectation fails.
     * @param {*} condition The condition to check for truthiness.
     * @param {string} message The message to display if the check fails.
     */
    function expect(condition, message) {
        if (!condition) {
            console.error(
                'Unexpected condition on ' + document.location.href + ': ' + message);
        }
    }

    /**
     * Checks that the given value has the given type.
     * @param {string} id The id of the value (only used for error message).
     * @param {*} value The value to check the type on.
     * @param {string} type The type we expect |value| to be.
     */
    function expectIsType(id, value, type) {
        expect(
            typeof value == type, '[' + value + '] (' + id + ') is not a ' + type);
    }

    expect(!loadTimeData, 'should only include this file once');
    loadTimeData = new LoadTimeData;
})();

loadTimeData.data = {
  "details": "Details",
  "errorCode": "ERR_INTERNET_DISCONNECTED",
  "fontfamily": "'Segoe UI', Tahoma, sans-serif",
  "fontsize": "75%",
  "heading": {
    "hostName": "nana.nana.boo.boo.stick.your.head.in.doodoo",
    "msg": "No internet"
  },
  "hideDetails": "Hide details",
  "iconClass": "icon-offline",
  "language": "en",
  "suggestionsDetails": [],
  "suggestionsSummaryList": [
    {
      "summary": "Checking the network cables, modem, and router"
    },
    {
      "summary": "Reconnecting to Wi-Fi"
    }
  ],
  "suggestionsSummaryListHeader": "Try:",
  "summary": {
    "failedUrl": "nana.nana.boo.boo.stick.your.head.in.doodoo.com",
    "hostName": "nana.nana.boo.boo.stick.your.head.in.doodoo",
    "msg": "No internet"
  },
  "textdirection": "ltr",
  "title": "nana.nana.boo.boo.stick.your.head.in.doodoo"
};

// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Note: vulcanize sometimes disables GRIT processing. If you're importing i18n
// stuff with <link rel="import">, you should probably be using
// html/i18n_template.html instead of this file.

// // Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/** @typedef {Document|DocumentFragment|Element} */
var ProcessingRoot;

/**
 * @fileoverview This is a simple template engine inspired by JsTemplates
 * optimized for i18n.
 *
 * It currently supports three handlers:
 *
 *   * i18n-content which sets the textContent of the element.
 *
 *     <span i18n-content="myContent"></span>
 *
 *   * i18n-options which generates <option> elements for a <select>.
 *
 *     <select i18n-options="myOptionList"></select>
 *
 *   * i18n-values is a list of attribute-value or property-value pairs.
 *     Properties are prefixed with a '.' and can contain nested properties.
 *
 *     <span i18n-values="title:myTitle;.style.fontSize:fontSize"></span>
 *
 * This file is a copy of i18n_template.js, with minor tweaks to support using
 * load_time_data.js. It should replace i18n_template.js eventually.
 */

var i18nTemplate = (function() {
    /**
     * This provides the handlers for the templating engine. The key is used as
     * the attribute name and the value is the function that gets called for every
     * single node that has this attribute.
     * @type {!Object}
     */
    var handlers = {
        /**
         * This handler sets the textContent of the element.
         * @param {!HTMLElement} element The node to modify.
         * @param {string} key The name of the value in |data|.
         * @param {!LoadTimeData} data The data source to draw from.
         * @param {!Set<ProcessingRoot>} visited
         */
        'i18n-content': function(element, key, data, visited) {
            element.textContent = data.getString(key);
        },

        /**
         * This handler adds options to a <select> element.
         * @param {!HTMLElement} select The node to modify.
         * @param {string} key The name of the value in |data|. It should
         *     identify an array of values to initialize an <option>. Each value,
         *     if a pair, represents [content, value]. Otherwise, it should be a
         *     content string with no value.
         * @param {!LoadTimeData} data The data source to draw from.
         * @param {!Set<ProcessingRoot>} visited
         */
        'i18n-options': function(select, key, data, visited) {
            var options = data.getValue(key);
            options.forEach(function(optionData) {
                var option = typeof optionData == 'string' ?
                    new Option(optionData) :
                    new Option(optionData[1], optionData[0]);
                select.appendChild(option);
            });
        },

        /**
         * This is used to set HTML attributes and DOM properties. The syntax is:
         *   attributename:key;
         *   .domProperty:key;
         *   .nested.dom.property:key
         * @param {!HTMLElement} element The node to modify.
         * @param {string} attributeAndKeys The path of the attribute to modify
         *     followed by a colon, and the name of the value in |data|.
         *     Multiple attribute/key pairs may be separated by semicolons.
         * @param {!LoadTimeData} data The data source to draw from.
         * @param {!Set<ProcessingRoot>} visited
         */
        'i18n-values': function(element, attributeAndKeys, data, visited) {
            var parts = attributeAndKeys.replace(/\s/g, '').split(/;/);
            parts.forEach(function(part) {
                if (!part)
                    return;

                var attributeAndKeyPair = part.match(/^([^:]+):(.+)$/);
                if (!attributeAndKeyPair)
                    throw new Error('malformed i18n-values: ' + attributeAndKeys);

                var propName = attributeAndKeyPair[1];
                var propExpr = attributeAndKeyPair[2];

                var value = data.getValue(propExpr);

                // Allow a property of the form '.foo.bar' to assign a value into
                // element.foo.bar.
                if (propName[0] == '.') {
                    var path = propName.slice(1).split('.');
                    var targetObject = element;
                    while (targetObject && path.length > 1) {
                        targetObject = targetObject[path.shift()];
                    }
                    if (targetObject) {
                        targetObject[path] = value;
                        // In case we set innerHTML (ignoring others) we need to recursively
                        // check the content.
                        if (path == 'innerHTML') {
                            for (var i = 0; i < element.children.length; ++i) {
                                processWithoutCycles(element.children[i], data, visited, false);
                            }
                        }
                    }
                } else {
                    element.setAttribute(propName, /** @type {string} */ (value));
                }
            });
        }
    };

    var prefixes = [''];

    // Only look through shadow DOM when it's supported. As of April 2015, iOS
    // Chrome doesn't support shadow DOM.
    if (Element.prototype.createShadowRoot)
        prefixes.push('* /deep/ ');

    var attributeNames = Object.keys(handlers);
    var selector = prefixes
        .map(function(prefix) {
            return prefix + '[' +
                attributeNames.join('], ' + prefix + '[') + ']';
        })
        .join(', ');

    /**
     * Processes a DOM tree using a |data| source to populate template values.
     * @param {!ProcessingRoot} root The root of the DOM tree to process.
     * @param {!LoadTimeData} data The data to draw from.
     */
    function process(root, data) {
        processWithoutCycles(root, data, new Set(), true);
    }

    /**
     * Internal process() method that stops cycles while processing.
     * @param {!ProcessingRoot} root
     * @param {!LoadTimeData} data
     * @param {!Set<ProcessingRoot>} visited Already visited roots.
     * @param {boolean} mark Whether nodes should be marked processed.
     */
    function processWithoutCycles(root, data, visited, mark) {
        if (visited.has(root)) {
            // Found a cycle. Stop it.
            return;
        }

        // Mark the node as visited before recursing.
        visited.add(root);

        var importLinks = root.querySelectorAll('link[rel=import]');
        for (var i = 0; i < importLinks.length; ++i) {
            var importLink = /** @type {!HTMLLinkElement} */ (importLinks[i]);
            if (!importLink.import) {
                // Happens when a <link rel=import> is inside a <template>.
                // TODO(dbeam): should we log an error if we detect that here?
                continue;
            }
            processWithoutCycles(importLink.import, data, visited, mark);
        }

        var templates = root.querySelectorAll('template');
        for (var i = 0; i < templates.length; ++i) {
            var template = /** @type {HTMLTemplateElement} */ (templates[i]);
            if (!template.content)
                continue;
            processWithoutCycles(template.content, data, visited, mark);
        }

        var isElement = root instanceof Element;
        if (isElement && root.webkitMatchesSelector(selector))
            processElement( /** @type {!Element} */ (root), data, visited);

        var elements = root.querySelectorAll(selector);
        for (var i = 0; i < elements.length; ++i) {
            processElement(elements[i], data, visited);
        }

        if (mark) {
            var processed = isElement ? [root] : root.children;
            if (processed) {
                for (var i = 0; i < processed.length; ++i) {
                    processed[i].setAttribute('i18n-processed', '');
                }
            }
        }
    }

    /**
     * Run through various [i18n-*] attributes and populate.
     * @param {!Element} element
     * @param {!LoadTimeData} data
     * @param {!Set<ProcessingRoot>} visited
     */
    function processElement(element, data, visited) {
        for (var i = 0; i < attributeNames.length; i++) {
            var name = attributeNames[i];
            var attribute = element.getAttribute(name);
            if (attribute != null)
                handlers[name](element, attribute, data, visited);
        }
    }

    return {
        process: process
    };
}());

// // Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

i18nTemplate.process(document, loadTimeData);
