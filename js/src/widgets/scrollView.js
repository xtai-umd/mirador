(function($) {

  $.ScrollView = function(options) {

    jQuery.extend(this, {
      currentImg:       null,
      windowId:         null,
      currentImgIndex:  0,
      stitchList:       [],
      canvasID:          null,
      imagesList:       [],
      element:          null,
      focusImages:      [],
      manifest:         null,
      viewingDirection: 'left-to-right',
      viewingHint:      'paged',
      osd:              null,
      osdCls:           'mirador-osd',
      osdOptions: {
        osdBounds:        null,
        zoomLevel:        null
      },
      stitchTileMargin: 10,
      eventEmitter: null
    }, options);

    this.init();
  };


  $.ScrollView.prototype = {

    init: function() {
      var _this = this;
      if (this.canvasID !== null) {
        this.currentImgIndex = $.getImageIndexById(this.imagesList, this.canvasID);
      }

      if (!this.osdOptions) {
        this.osdOptions = {
          osdBounds:        null,
          zoomLevel:        null
        };
      }

      this.currentImg = this.imagesList[this.currentImgIndex];

      this.element = jQuery(this.template()).appendTo(this.appendTo);

      this.hud = new $.Hud({
        appendTo: this.element,
        bottomPanelAvailable: false,
        windowId: this.windowId,
        annotationLayerAvailable: false,
        showNextPrev : false,
        eventEmitter: this.eventEmitter,
        showAnno: false,
        showImageControls: false,
        showImageClipping: false
      });

      if (this.manifest.jsonLd.sequences[0].viewingDirection) {
        this.viewingDirection = this.manifest.jsonLd.sequences[0].viewingDirection.toLowerCase();
      }
      if (this.manifest.jsonLd.sequences[0].viewingHint) {
        this.viewingHint = this.manifest.jsonLd.sequences[0].viewingHint.toLowerCase();
      }

      this.stitchList = this.getStitchList();
      this.createOpenSeadragonInstance();

      this.bindEvents();
      this.listenForActions();

      _this.eventEmitter.publish('SET_BOTTOM_PANEL_VISIBILITY.' + this.windowId, false);
    },

    template: Handlebars.compile([
                                 '<div class="scroll-view">',
                                 '</div>'
    ].join('')),

    listenForActions: function() {
      var _this = this,
      firstCanvasId = _this.imagesList[0]['@id'],
      lastCanvasId = _this.imagesList[_this.imagesList.length-1]['@id'];

      _this.eventEmitter.subscribe('fitBounds.' + _this.windowId, function(event, bounds) {
        var rect = _this.osd.viewport.imageToViewportRectangle(Number(bounds.x), Number(bounds.y), Number(bounds.width), Number(bounds.height));
        _this.osd.viewport.fitBoundsWithConstraints(rect, false);
      });

      _this.eventEmitter.subscribe('currentCanvasIDUpdated.' + _this.windowId, function(event, canvasId) {
        _this.element.find('.mirador-osd-next').hide();
        _this.element.find('.mirador-osd-previous').hide();
      });
    },

    bindEvents: function() {
      var _this = this;

      this.element.find('.mirador-osd-go-home').on('click', function() {
        _this.osd.viewport.goHome();
      });

      this.element.find('.mirador-osd-up').on('click', function() {
        var panBy = _this.getPanByValue();
        _this.osd.viewport.panBy(new OpenSeadragon.Point(0, -panBy.y));
        _this.osd.viewport.applyConstraints();
      });
      this.element.find('.mirador-osd-right').on('click', function() {
        var panBy = _this.getPanByValue();
        _this.osd.viewport.panBy(new OpenSeadragon.Point(panBy.x, 0));
        _this.osd.viewport.applyConstraints();
      });
      this.element.find('.mirador-osd-down').on('click', function() {
        var panBy = _this.getPanByValue();
        _this.osd.viewport.panBy(new OpenSeadragon.Point(0, panBy.y));
        _this.osd.viewport.applyConstraints();
      });
      this.element.find('.mirador-osd-left').on('click', function() {
        var panBy = _this.getPanByValue();
        _this.osd.viewport.panBy(new OpenSeadragon.Point(-panBy.x, 0));
        _this.osd.viewport.applyConstraints();
      });

      this.element.find('.mirador-osd-zoom-in').on('click', function() {
        var osd = _this.osd;
        if ( osd.viewport ) {
          osd.viewport.zoomBy(
            osd.zoomPerClick / 1.0
          );
          osd.viewport.applyConstraints();
        }
      });
      this.element.find('.mirador-osd-zoom-out').on('click', function() {
        var osd = _this.osd;
        if ( osd.viewport ) {
          osd.viewport.zoomBy(
            1.0 / osd.zoomPerClick
          );
          osd.viewport.applyConstraints();
        }
      });
    },

    getPanByValue: function() {
      var bounds = this.osd.viewport.getBounds(true);
      //for now, let's keep 50% of the image on the screen
      var panBy = {
        "x" : bounds.width * 0.5,
        "y" : bounds.height * 0.5
      };
      return panBy;
    },

    setBounds: function() {
      var _this = this;
      this.osdOptions.osdBounds = this.osd.viewport.getBounds(true);
      _this.eventEmitter.publish("imageBoundsUpdated", {
        id: _this.windowId,
          osdBounds: {
            x: _this.osdOptions.osdBounds.x,
            y: _this.osdOptions.osdBounds.y,
            width: _this.osdOptions.osdBounds.width,
            height: _this.osdOptions.osdBounds.height
          }
      });
    },

    toggle: function(stateValue) {
      if (stateValue) {
        this.show();
      } else {
        this.hide();
      }
    },

    hide: function() {
      jQuery(this.element).hide({effect: "fade", duration: 300, easing: "easeOutCubic"});
    },

    show: function() {
      jQuery(this.element).show({
        effect: "fade", duration: 300, easing: "easeInCubic", complete: function () {
          // Under firefox $.show() used under display:none iframe does not change the display.
          // This is workaround for https://github.com/IIIF/mirador/issues/929
          jQuery(this).css('display', 'block');
        }
      });
    },

    adjustWidth: function(className, hasClass) {
      var _this = this;
      if (hasClass) {
        _this.eventEmitter.publish('REMOVE_CLASS.'+this.windowId, className);
      } else {
        _this.eventEmitter.publish('ADD_CLASS.'+this.windowId, className);
      }
    },

    adjustHeight: function(className, hasClass) {
      if (hasClass) {
        this.element.removeClass(className);
      } else {
        this.element.addClass(className);
      }
    },

    updateImage: function(canvasID) {
      this.canvasID = canvasID;
      this.currentImgIndex = $.getImageIndexById(this.imagesList, this.canvasID);
      this.currentImg = this.imagesList[this.currentImgIndex];
      var newList = this.getStitchList();
      var is_same = this.stitchList.length == newList.length && this.stitchList.every(function(element, index) {
        return element === newList[index];
      });
      if (!is_same) {
        this.stitchList = newList;
        this.osdOptions = {
          osdBounds:        null,
          zoomLevel:        null
        };
        this.osd.close();
        this.createOpenSeadragonInstance();
      }
    },

    createOpenSeadragonInstance: function() {
      var uniqueID = $.genUUID(),
      osdId = 'mirador-osd-' + uniqueID,
      osdToolBarId = osdId + '-toolbar',
      elemOsd,
      tileSources = [],
      _this = this,
      toolbarID = 'osd-toolbar-' + uniqueID,
      dfd = jQuery.Deferred();

      this.element.find('.' + this.osdCls).remove();

      jQuery.each(this.stitchList, function(index, image) {
        var imageUrl = $.Iiif.getImageUrl(image),
        infoJsonUrl = imageUrl + '/info.json';

        jQuery.getJSON(infoJsonUrl).done(function (data, status, jqXHR) {
          tileSources.splice(index, 0, data);
          if (tileSources.length === _this.stitchList.length ) { dfd.resolve(); }
        });
      });

      dfd.done(function () {
        var aspectRatio = tileSources[0].height / tileSources[0].width;

        elemOsd =
          jQuery('<div/>')
        .addClass(_this.osdCls)
        .attr('id', osdId)
        .appendTo(_this.element);

        _this.osd = $.OpenSeadragon({
          'id':         elemOsd.attr('id'),
          'toolbarID' : toolbarID
        });

        _this.osd.addHandler('open', function(){
          _this.addLayer(tileSources.slice(1), aspectRatio);
          var addItemHandler = function( event ) {
            _this.osd.world.removeHandler( "add-item", addItemHandler );
            if (_this.osdOptions.osdBounds) {
              var rect = new OpenSeadragon.Rect(_this.osdOptions.osdBounds.x, _this.osdOptions.osdBounds.y, _this.osdOptions.osdBounds.width, _this.osdOptions.osdBounds.height);
              _this.osd.viewport.fitBounds(rect, true);
            } else {
              // _this.osd.viewport.goHome(true);
            }
          };

          _this.osd.world.addHandler( "add-item", addItemHandler );

          _this.osd.addHandler('zoom', $.debounce(function(){
            _this.setBounds();
          }, 300));

          _this.osd.addHandler('pan', $.debounce(function(){
            _this.setBounds();
          }, 300));
        });

        _this.osd.open(tileSources[0], {opacity:1, x:0, y:0, width:1});
      });

    },

    addLayer: function(tileSources, aspectRatio) {
      var _this = this;
      var new_x = 1.01;
      jQuery.each(tileSources, function(index, value) {
        var newAR = (value.height / value.width);
        var options = {
          tileSource: value,
          opacity: 1,
          x: new_x,
          y: 0,
          width: aspectRatio / newAR
        };
        new_x += aspectRatio / newAR + 0.01;
        _this.osd.addTiledImage(options);
      });
    },

    getStitchList: function() {
      // Need to check metadata for object type and viewing direction
      // Default to 'paged' and 'left-to-right'
      // Set index(es) for any other images to stitch with selected image
      var stitchList = [],
      _this = this;

      if (this.viewingHint === 'individuals') {
        // don't do any stitching, display like an imageView
        stitchList = [this.currentImg];
      } else if (this.viewingHint === 'paged') {
        stitchList = this.imagesList;
      } else if (this.viewingHint === 'continuous') {
        // TODO: stitch all images together per the viewingDirection
      } else {
        // undefined viewingHint, don't do anything
      }
      return stitchList;
    }
  };

}(Mirador));
