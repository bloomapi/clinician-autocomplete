/*exported Autocomplete */

/*
 * autocomplete.js
 * https://github.com/bloomapi/clinician-autocomplete
 * Copyright 2015 BloomAPI, Inc.; Licensed MIT
 */

if (!Function.prototype.bind) {
  Function.prototype.bind = function(oThis) {
    if (typeof this !== 'function') {
      // closest thing possible to the ECMAScript 5
      // internal IsCallable function
      throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable');
    }

    var aArgs   = Array.prototype.slice.call(arguments, 1),
        fToBind = this,
        fNOP    = function() {},
        fBound  = function() {
          return fToBind.apply(this instanceof fNOP ? this : oThis,
                 aArgs.concat(Array.prototype.slice.call(arguments)));
        };

    fNOP.prototype = this.prototype;
    fBound.prototype = new fNOP();

    return fBound;
  };
}

if (!Array.prototype.forEach) {
  Array.prototype.forEach = function (fn, scope) {
    for (var i = 0, len = this.length; i < len; ++i) {
      fn.call(scope || this, this[i], i, this);
    }
  };
}  

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

  var _ = (function() {

    return {
      isMsie: function() {
        // from https://github.com/ded/bowser/blob/master/bowser.js
        return (/(msie|trident)/i).test(navigator.userAgent) ?
          navigator.userAgent.match(/(msie |rv:)(\d+(.\d+)?)/i)[2] : false;
      },
      error: function(err) { console.log(err);},
      //shallow merge
      smerge: function(obj1, obj2) {
        var key, obj3 = {};
        for (key in obj1) { obj3[key] = obj1[key]; }
        for (key in obj2) { obj3[key] = obj2[key]; }
        return obj3;
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
      forEach: function(fakeArray, cb) {
        Array.prototype.slice.call(fakeArray).forEach(cb);
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
      _.error('missing input id');
    }

    if(!o.apiKey) {
      _.error('missing api key, https://www.bloomapi.com/documentation/XXX');
    }

    var defaults = {
      bloomURI : 'https://www.bloomapi.com/api/',
      limit : 5,
      highlight : true,
      enableGeoLocation : true,
      distance: 25 //miles
    };

    this.options = _.smerge(defaults, o);

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
    id.parentNode.insertBefore(templateToDocumentFragment(menuTemplate), id.nextSibling);
    this.menu = id.nextSibling;

    // Event Callbacks & Input Binding
    // ==============
    this._eventCallbacks = {};
    
    //User Input Events
    if (!_.isMsie() || _.isMsie() > 8) {
      this.input.addEventListener('keydown', this._onKeydown.bind(this), false);
      this.input.addEventListener('input', this._onInput.bind(this), false);
      this.menu.addEventListener('click', this._onClick.bind(this), false);
    } else {
      this.input.attachEvent('onkeydown', this._onKeydown.bind(this));
      //ie doesn't support input.
      this.input.attachEvent('onkeyup', this._onInput.bind(this));
      this.menu.attachEvent('onclick', this._onClick.bind(this));
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
    var node = evt.srcElement.parentNode;
    //from click, bubble up looking for selectable
    while(node !== document && !node.hasAttribute('data-cac-id')) {
      node = node.parentNode;
    }

    //handle clicks!
    if (node !== document) {
      return this._selectEntry(evt, node.getAttribute('data-cac-id'));
    }
  };

  Autocomplete.prototype._onKeydown = function(evt) {
    var keyName = evt.which || evt.keyCode;
    var node, suggestions, next;
    switch (keyName) {
      case keyCodeMap.ESCAPE:
        this._closeMenu();
        break;
      case keyCodeMap.UP:
        node = this.menu.querySelector(".cac-cursor");
        suggestions = Array.prototype.slice.call(this.menu.querySelectorAll('.cac-suggestion'));

        if (node) {
          next = (node.previousSibling && node.previousSibling.hasAttribute('data-cac-id') ? node.previousSibling : suggestions[suggestions.length - 1]);
          _.removeClass(node, 'cac-cursor');
          _.addClass(next, 'cac-cursor');
        } else {
          //start at the end
          _.addClass(suggestions[suggestions.length - 1], 'cac-cursor');
        }
        break;
      case keyCodeMap.DOWN:
        node = this.menu.querySelector(".cac-cursor");
        suggestions = Array.prototype.slice.call(this.menu.querySelectorAll('.cac-suggestion'));

        if (node) {
          next = (node.nextSibling != null ? node.nextSibling : suggestions[0]);
          _.removeClass(node, 'cac-cursor');
          _.addClass(next, 'cac-cursor');
        } else {
          //start at the beginging
          _.addClass(suggestions[0], 'cac-cursor');
        }
        break;
      case keyCodeMap.TAB:
        // select first entry
        node = this.menu.querySelector(".cac-suggestion");
        if (node) {
          this._selectEntry(evt, node.getAttribute('data-cac-id'));
        }
        evt.preventDefault();
        break;
      case keyCodeMap.ENTER:
        //select current entry
        node = this.menu.querySelector(".cac-cursor");
        if (node) {
          this._selectEntry(evt, node.getAttribute('data-cac-id'));
        }
        evt.preventDefault();
      break;
      default:
    }
  };

  Autocomplete.prototype._onInput = function(evt) {
    //user deleted all the input text, hide the menu
    if (evt.srcElement.value.length === 0) {
      this._closeMenu();
      return;
    }
    //user entered input text, get predictions.
    this._getPredictions();
  };

  // Event Emitter -- inspired by Emitter https://github.com/component/emitter
  // ==============

  Autocomplete.prototype.on = Autocomplete.prototype.addEventListener = function(event, fn) {
    this._eventCallbacks[event] = this._eventCallbacks[event] || [];
    this._eventCallbacks[event].push(fn);
    return this;
  };

  Autocomplete.prototype.emit = function(event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var callbacks = this._eventCallbacks[event];

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
          r.innerText = data[key];              
        }
      }
    }
  }

  // Private Methods
  // ================

  Autocomplete.prototype._selectEntry = function(evt, npi) {
    var that = this;
    //update input
    this.input.value = this.dataStore[npi].first_name + ' ' +     this.dataStore[npi].last_name;

    //hide menu
    this._closeMenu();

    //get full NPI
    var query = this.options.bloomURI + 'sources/usgov.hhs.npi/' + npi +
                '?secret=' + this.options.apiKey;
    return this._getJSONP(query, onResponse.bind(this));

    function onResponse(err, data) {
      //signal completion
      if (err || !data || _.isEmpty(data) || !('result' in data)) {
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
    this.menu.style.display = 'inline-block';
    this.emit(cacEvents.open);
  };

  Autocomplete.prototype._populateMenu = function(data) {
    var that = this;
    //Menu Templates
    var itemTemplate = '<div class="cac-result cac-suggestion cac-selectable"><div class="cac-details">  <span class="cac-first-name"></span> <span class="cac-last-name"></span>  <span class="cac-credential"></span>  <div class="cac-speciality"></div>  <div class="cac-identifier">NPI: <span class="cac-npi"></span></div></div><div class="cac-address">  <div class="cac-address-line"></div>  <span class="cac-city"></span>, <span class="cac-state"></span> <span class="cac-zip"></span></div></div>';
    var headerTemplate = '<div class="cac-header">Clinicians Near <span class="cac-zip"></span>:</div>';
    var noResultsTemplate = '<p class="no-results-message">No results found</p>';

    if (that.menu.children.length !== 0) {
      Array.prototype.slice.call(that.menu.children).forEach(function(child) {
        that.menu.removeChild(child);
      });
    }

    if (data.length === 0) {
      //show no results template
      this.menu.appendChild(templateToDocumentFragment(noResultsTemplate));
    } else if (this.options.enableGeoLocation && this.zipcode) {
      //Add header to menu, must be added first
      var header = templateToDocumentFragment(headerTemplate);
      fillTemplate(this.classPrefix, header, {zip : this.zipcode});
      console.log(header.childNodes[0]);
      this.menu.appendChild(header);
    }

    //Add an item for each result
    data.slice(0, this.options.limit).forEach(function(itemData) {
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
    var query = this.options.bloomURI + 'clinician-identity/discovery';
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

    query += '?' + _.encodeQueryData(params);

    window.clearTimeout(this.currentTimer);

    return this.currentTimer = window.setTimeout(function () {
      that._getJSONP(query, onResponse.bind(that));
    }, 200);

    function onResponse(err, data) {
      that._populateMenu(data);
    }
  };


  Autocomplete.prototype._getLocation = function(cb) {
    if (!cb) {return;}
    if (!this.options.enableGeoLocation) {return;}
    var that = this;

    var query = this.options.bloomURI + 'clinician-identity/location';
    return this._getJSONP(query, onResponse.bind(this));

    function onResponse(err, data) {
      if (err || !data || _.isEmpty(data) || !('zipcode' in data)) {
        return cb(null);
      }
      that.zipcode = data.zipcode;
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