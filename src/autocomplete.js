/*exported Autocomplete */

/*
 * autocomplete.js
 * https://github.com/bloomapi/clinician-autocomplete
 * Copyright 2015 BloomAPI, Inc.; Licensed MIT
 */

var Autocomplete = (function() {
  'use strict';

  var keyCodeMap = {
    TAB: 9,
    ESCAPE: 27,
    UP: 38,
    DOWN: 40,
    RIGHT: 39,
    LEFT: 37,
    ENTER: 13
  };

  var cacEvents = {
    open: 'open',
    close: 'close',
    select: 'select'
  };

  var fill = (function() {

    return {
      error: function(err) { console.log(err);},
      //shallow merge
      smerge: function(obj1, obj2) {
        var key, obj3 = {};
        for (key in obj1) { obj3[key] = obj1[key]; }
        for (key in obj2) { obj3[key] = obj2[key]; }
        return obj3;
      },
      forEach: function (arr, fn, scope) {
        for (var i = 0, len = arr.length; i < len; ++i) {
          fn.call(scope || arr, arr[i], i, arr);
        }
      },
      bind: function (oThis, sThis) {
        if (typeof sThis !== 'function') {
          // closest thing possible to the ECMAScript 5
          // internal IsCallable function
          throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable');
        }

        var aArgs   = Array.prototype.slice.call(arguments, 2),
            fToBind = sThis,
            FNOP    = function() {},
            fBound  = function() {
              return fToBind.apply(sThis instanceof FNOP ? sThis : oThis,
                     aArgs.concat(Array.prototype.slice.call(arguments)));
            };

        FNOP.prototype = sThis.prototype;
        fBound.prototype = new FNOP();

        return fBound;
      },
      isEmpty: function(obj) { 
        for(var p in obj) {
          if(obj.hasOwnProperty(p)) {
            return false;
          }
          return true;
        }
      },
      addClass: function(node, mclass) {
        var classList = node.className.split(/\s/);
        classList.push(mclass);
        node.className = classList.join(' ');
      },
      removeClass: function(node, mclass) {
        var classList = node.className.split(/\s/);
        for (var i in classList) {
          if (classList[i] === mclass) {
            classList.splice(i, 1);
          }
        }
        node.className = classList.join(' ');
      },
      encodeQueryData: function(data) {
        var ret = [];
        for (var d in data) {
          ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
        }
        return ret.join('&');
      },
      getOffset: function (elm) {
        var x = 0, y = 0;

        while( elm && !isNaN( elm.offsetLeft ) && !isNaN( elm.offsetTop ) ) {
          x += elm.offsetLeft - elm.scrollLeft;
          y += elm.offsetTop - elm.scrollTop;
          elm = elm.offsetParent;
        }

        return { top: y, left: x };
      },
      addEventListener: function (elm, event, cb) {
        if (window.addEventListener) {
          elm.addEventListener(event, cb, false);
        } else if (window.attachEvent) {
          elm.attachEvent("on" + event, cb);
        }
      },
      removeEventListener: function (elm, event, cb) {
        if (window.removeEventListener) {
          elm.removeEventListener(event, cb, false);
        } else if (window.detachEvent) {
          if (event != null && event !== "") {
            elm.detachEvent("on" + event, cb);
          } else {
            elm.detachEvent(null, cb);
          }
        }
      }
    };
  })();




  // Constructor
  // ===========
  function Autocomplete(id, o) {
    var that = this;

    //Catch users forgetting to 'new'
    if (!(this instanceof Autocomplete)) {
      return new Autocomplete(o);
    }

    // Options & Defaults
    // ==================
    o = o || {};
    this.input = id;
    id.className = (id.className ? id.className + ' ' + id.id : id.id);

    if (!id) {
      fill.error('missing input id');
    }

    if(!o.apiKey) {
      fill.error('missing api key, https://www.bloomapi.com/documentation/clinician-identity/#customization');
    }

    var defaults = {
      bloomURI : 'https://www.bloomapi.com/api/',
      limit : 5,
      highlight : true,
      enableGeoLocation : true,
      distance: 25 //miles
    };

    this.options = fill.smerge(defaults, o);

    //storing NPI data
    this.dataStore = {};

    //default to no zipcode.
    this.zipcode = null;
    this.classPrefix = 'cac';
    this.selectionId = 'data-cac-id';

    // Setup
    // ====================

    var autocompleteCss = 'AUTOCOMPLETE_CSS';

    var head = document.head || document.getElementsByTagName('head')[0];
    var style = document.createElement('style');
    style.type = 'text/css';
    if (style.styleSheet){
      style.styleSheet.cssText = autocompleteCss;
    } else {
      style.appendChild(document.createTextNode(autocompleteCss));
    }
    head.appendChild(style);


    var menuTemplate = "<div class='" + this.classPrefix + "-dropdown-menu' style='display: none; width:"+that.input.clientWidth+"px; visibility: visible;'></div>";
    var menuElm = templateToDocumentFragment(menuTemplate).children[0];

    document.body.appendChild(menuElm);
    this.menu = menuElm;

    // Event Callbacks & Input Binding
    // ==============
    this._eventCallbacks = {};
    
    //User Input Events
    fill.addEventListener(this.input, 'keydown', fill.bind(this, this._onKeyDown));
    fill.addEventListener(this.input, 'focus', fill.bind(this, this._onInputFocus));
    fill.addEventListener(this.input, 'blur', fill.bind(this, this._onInputBlur));
    fill.addEventListener(this.menu, 'click', fill.bind(this, this._onClick));

    //If probably IE8 -- 'input' event support not easily detected
    if (window.attachEvent) {
      fill.addEventListener(this.input, 'keyup', fill.bind(this, this._onInputChange));
    } else {
      fill.addEventListener(this.input, 'input', fill.bind(this, this._onInputChange));
    }

    //ignore zipcode if we don't get one from the server.
    this._getLocation(function(zipcode) {
      if (zipcode) {
        that.zipcode = zipcode;
        var node = document.getElementById(that.classPrefix + '-location-zipcode');
        if (node) {
          node.value = zipcode;
        }
      }
    });
  }

  // Event Handlers
  // ====================
  Autocomplete.prototype._onClick = function(evt) {
    var target, node;

    target = evt.target || evt.srcElement;
    node = target.parentNode;

    //from click, bubble up looking for selectable
    while(node !== document && !node.hasAttribute('data-cac-id')) {
      node = node.parentNode;
    }

    //handle clicks!
    if (node !== document) {
      return this._selectEntry(evt, node.getAttribute('data-cac-id'));
    }
  };

  Autocomplete.prototype._onKeyDown = function (evt) {
    var keyName = evt.which || evt.keyCode;
    var node, suggestions, next;

    switch (keyName) {
      case keyCodeMap.ESCAPE:
        this._closeMenu();
        evt.preventDefault ? evt.preventDefault() : evt.returnValue = false;
        break;
      case keyCodeMap.UP:
        node = this.menu.querySelector(".cac-cursor");
        suggestions = this.menu.querySelectorAll('.cac-suggestion');

        if (node) {
          next = (node.previousSibling && node.previousSibling.hasAttribute('data-cac-id') ? node.previousSibling : suggestions[suggestions.length - 1]);
          fill.removeClass(node, 'cac-cursor');
          fill.addClass(next, 'cac-cursor');
        } else {
          //start at the end
          fill.addClass(suggestions.item(suggestions.length - 1), 'cac-cursor');
        }
        evt.preventDefault ? evt.preventDefault() : evt.returnValue = false;
        break;
      case keyCodeMap.DOWN:
        node = this.menu.querySelector(".cac-cursor");
        suggestions = this.menu.querySelectorAll('.cac-suggestion');

        if (node) {
          next = (node.nextSibling != null ? node.nextSibling : suggestions[0]);
          fill.removeClass(node, 'cac-cursor');
          fill.addClass(next, 'cac-cursor');
        } else {
          //start at the beginging
          fill.addClass(suggestions.item(0), 'cac-cursor');
        }
        evt.preventDefault ? evt.preventDefault() : evt.returnValue = false;
        break;
      case keyCodeMap.TAB:
        // select first entry
        node = this.menu.querySelector(".cac-suggestion");
        if (node) {
          this._selectEntry(evt, node.getAttribute('data-cac-id'));
        }
        evt.preventDefault ? evt.preventDefault() : evt.returnValue = false;
        break;
      case keyCodeMap.ENTER:
        //select current entry
        node = this.menu.querySelector(".cac-cursor");
        if (node) {
          this._selectEntry(evt, node.getAttribute('data-cac-id'));
        }
        evt.preventDefault ? evt.preventDefault() : evt.returnValue = false;
      break;
      default:
    }
  };

  Autocomplete.prototype._onInputChange = function(evt) {
    var target = evt.target || evt.srcElement;
    var keyName = evt.which || evt.keyCode;

    switch (keyName) {
      case keyCodeMap.ESCAPE:
      case keyCodeMap.UP:
      case keyCodeMap.DOWN:
      case keyCodeMap.TAB:
      case keyCodeMap.ENTER:
        return;
      default:
    }

    if (target.value.length === 0) {
      this._closeMenu();
    } else {
      this._getPredictions();
    }
  };

  Autocomplete.prototype._onInputFocus = function() {
    if (this._resizeHandler == null) {
      this._resizeHandler = fill.bind(this, this._handleResize);
    }

    fill.addEventListener(window, 'resize', this._resizeHandler);

    this._getPredictions();
  };

  Autocomplete.prototype._onInputBlur = function() {
    if (this._resizeHandler == null) {
      return;
    }

    fill.removeEventListener(window, 'resize', this._resizeHandler);
    this._resizeHandler = null;

    setTimeout(fill.bind(this, this._closeMenu), 200);
  };

  // Event Emitter -- inspired by Emitter https://github.com/component/emitter
  // ==============

  Autocomplete.prototype.on = Autocomplete.prototype.addEventListener = function(event, fn) {
    this._eventCallbacks[event] = this._eventCallbacks[event] || [];
    this._eventCallbacks[event].push(fn);
    return this;
  };

  Autocomplete.prototype.emit = function(event) {
    var args = [];
    var callbacks = this._eventCallbacks[event];

    for(var z = 1; z < arguments.length; z++) {
      args.push(arguments[z]);
    }

    if (callbacks) {
      callbacks = callbacks.slice(0);
      for (var i = 0, len = callbacks.length; i < len; ++i) {
        callbacks[i].apply(this, args);
      }
    }
    return this;
  };

  Autocomplete.prototype.removeEventListener = function(event, fn) {
    this._eventCallbacks[event] = this._eventCallbacks[event] || [];
    delete this._eventCallbacks[event][this._eventCallbacks[event].indexOf(fn)];
  };

  // Static Methods
  // ==============

  function templateToDocumentFragment(htmlStr) {
    var frag = document.createDocumentFragment(),
        temp = document.createElement('div');
    temp.innerHTML = htmlStr;
    while (temp.firstChild) {
        frag.appendChild(temp.firstChild);
    }
    return frag;
  }

  function fillTemplate(prefix, node, data) {
    for (var key in data) {
      var query = '.' + prefix + '-'+ key.replace(/_/, '-');
      var r = node.querySelector(query);

      if(r != null) {
        if(typeof data[key] === "object") {
          fillTemplate(prefix, r, data[key]);
        } else {
          if('textContent' in document.body) {
            r.textContent = data[key];
          } else {
            r.innerText = data[key];
          }
        }
      }
    }
  }

  // Private Methods
  // ================

  Autocomplete.prototype._handleResize = function() {
    var currWinHeight = window.innerHeight || document.documentElement.clientHeight;
    var currWinWidth = window.innerWidth || document.documentElement.clientWidth;

    if (this.winWidth == null) {
      this.winHeight = currWinHeight;
      this.winWidth = currWinWidth;

      return;
    }

    if (currWinWidth !== this.winWidth || currWinHeight !== this.winHeight) {
      //probably IE8
      if (window.innerHeight != null) {
        //do nothing for IE8 as IE8 calls resize more often than it actually does
        this.input.blur();
      }
      this.winHeight = currWinHeight;
      this.winWidth = currWinWidth;
    }
  };

  Autocomplete.prototype._selectEntry = function(evt, npi) {
    var that = this;
    //update input
    this.input.value = this.dataStore[npi].first_name + ' ' +     this.dataStore[npi].last_name;

    //hide menu
    this._closeMenu();

    //get full NPI
    var query = this.options.bloomURI + 'sources/usgov.hhs.npi/' + npi +
                '?secret=' + this.options.apiKey;
    return this._getJSONP(query, fill.bind(this, onResponse));

    function onResponse(err, data) {
      //signal completion
      if (err || !data || fill.isEmpty(data) || !('result' in data)) {
        return that.emit(cacEvents.select, evt, null);
      }
      return that.emit(cacEvents.select, evt, data.result);
    }

  };

  Autocomplete.prototype._closeMenu = function() {
    this.menu.style.display = 'none';
    this.emit(cacEvents.close);
  };

  Autocomplete.prototype._openMenu = function() {
    var textOffset = fill.getOffset(this.input),
        textHeight = this.input.offsetHeight;

    this.menu.style.display = 'block';
    this.menu.style.top = textOffset.top + textHeight + "px";
    this.menu.style.left = textOffset.left + "px";

    this.emit(cacEvents.open);
  };

  Autocomplete.prototype._populateMenu = function(data) {
    var that = this;
    //Menu Templates
    var itemTemplate = '<div class="cac-result cac-suggestion cac-selectable"><div class="cac-details">  <span class="cac-first-name"></span> <span class="cac-last-name"></span>  <span class="cac-credential"></span>  <div class="cac-speciality"></div>  <div class="cac-identifier">NPI: <span class="cac-npi"></span></div></div><div class="cac-address">  <div class="cac-address-line"></div>  <span class="cac-city"></span>, <span class="cac-state"></span> <span class="cac-zip"></span></div></div>';
    var headerTemplate = '<div class="cac-header">Clinicians Near <span class="cac-zip"></span>:</div>';
    var noResultsTemplate = '<p class="no-results-message">No results found</p>';

    while(that.menu.firstChild) {
      that.menu.removeChild(that.menu.firstChild);
    }

    if (data.length === 0) {
      //show no results template
      this.menu.appendChild(templateToDocumentFragment(noResultsTemplate));
    } else if (this.options.enableGeoLocation && this.zipcode) {
      //Add header to menu, must be added first
      var header = templateToDocumentFragment(headerTemplate);
      fillTemplate(this.classPrefix, header, {zip : this.zipcode});
      this.menu.appendChild(header);
    }

    //Add an item for each result
    var items = data.slice(0, this.options.limit);
    fill.forEach(items, function(itemData) {
      var frag = templateToDocumentFragment(itemTemplate);
      fillTemplate(that.classPrefix, frag, itemData);
      frag.firstChild.setAttribute(that.selectionId, itemData.npi);
      that.menu.appendChild(frag);
      that.dataStore[itemData.npi] = itemData;
    });

    //show menu, if not shown
    this._openMenu();
  };

  Autocomplete.prototype._getPredictions = function() {
    var query = this.options.bloomURI + 'clinician-identity/autocomplete';
    var that = this;

    var params = {
        query : this.input.value, 
        limit: this.options.limit,
        secret: this.options.apiKey,
        distance: this.options.distance
      };

    if (this.options.enableGeoLocation && this.zipcode) {
      params.zipcode = this.zipcode;
    }

    query += '?' + fill.encodeQueryData(params);

    window.clearTimeout(this.currentTimer);

    return this.currentTimer = window.setTimeout(function () {
      that._getJSONP(query, fill.bind(this, onResponse));
    }, 200);

    function onResponse(err, data) {
      if (err || !data || fill.isEmpty(data) || !('results' in data)) {
        that._populateMenu([]);
      } else {
        that._populateMenu(data.results);
      }
    }
  };


  Autocomplete.prototype._getLocation = function(cb) {
    if (!cb) {return;}
    if (!this.options.enableGeoLocation) {return;}
    var that = this;

    var query = this.options.bloomURI + 'clinician-identity/location';
    query += '?' + fill.encodeQueryData({secret: this.options.apiKey});
    return this._getJSONP(query, fill.bind(this, onResponse));

    function onResponse(err, data) {
      if (err || !data || fill.isEmpty(data) || !('result' in data) || !('zipcode' in data.result)) {
        return cb(null);
      }
      that.zipcode = data.result.zipcode;
      return cb(that.zipcode);
    }
  };

  Autocomplete.prototype._getJSONP = function(url, cb) {
    var name = 'jsonp_' + Math.floor(Math.random() * Math.pow(10, 8)),
    script;

    if (url.match(/\?/)) {
      url += '&callback=' + name;
    } else {
      url += '?callback=' + name;
    }
    
    script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = url;
    
    // Setup handler
    window[name] = function (data) {
      cb.call(window, null, data);
      document.getElementsByTagName('head')[0].removeChild(script);
      script = null;
      try { 
        delete window[name];
      } catch(e) { 
        window[name] = undefined; 
      }
    };

    // Load JSON
    document.getElementsByTagName("head")[0].appendChild(script);
  };

  return Autocomplete;

})();