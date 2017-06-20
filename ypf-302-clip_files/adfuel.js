/* 
    AdFuel v0.8 
    
    -- Switch to synchronous loading of GPT Library and other necessary scripts.
    -- Improved single slot rendering that removes page-level targets from the slot.
    -- Switch to GPT implementation of slot suppression.
    -- Only refresh slots when window has focus on selected sites.
    -- Addition of clearSlot/clearSlots/clearAllSlots to enable container reuse.
    -- Added AdFuelRequestComplete event that will fire when AdFuel finishes requesting assets.
    -- Added GPTRenderComplete event that will fire when each ad slot is rendered.
    -- Added methods for managing dynamic targeting objects.
    -- Wrapped all calls to googletag.pubads() in a try/catch block to alleviate race conditions.
    -- Wrapped creation of AMPTManager in a try/catch block to prevent AdFuel errors affecting other page scripts.
    -- Removed ECMAScript5 shim.  Relying on site developers to include shim if needed.
    -- Fix for undefined slotObj when calling clearSlot/clearSlots
*/

window.domLoadEventFired = false;
if (window.addEventListener){
    window.addEventListener('load', function() { 
        window.domLoadEventFired = true; 
    }, false);
}else if (window.attachEvent) {
    window.attachEvent('onload', function() { 
        window.domLoadEventFired = true; 
    });
}

/* BEGIN GOOGLE GPT SERVICES */
var googletag = googletag || {};
googletag.cmd = googletag.cmd || [];
var slots = slots || [];

(function(){
    "use strict"
    var gads = document.createElement("script"),
    useSSL = "https:" === document.location.protocol,
    node = document.getElementsByTagName("script")[0];
    gads.async = false;
    gads.type = "text/javascript";
    gads.src = (useSSL ? "https:" : "http:") + "//www.googletagservices.com/tag/js/gpt.js";
    node.parentNode.insertBefore(gads, node);
})();
/* END GOOGLE GPT SERVICES */

if (typeof CustomEvent == "undefined"){
    (function () {
      function CustomEvent ( event, params ) {
        params = params || { bubbles: false, cancelable: false, detail: undefined };
        var evt = document.createEvent( 'CustomEvent' );
        evt.initCustomEvent( event, params.bubbles, params.cancelable, params.detail );
        return evt;
       }
      CustomEvent.prototype = window.Event.prototype;
      window.CustomEvent = CustomEvent;
    })();    
}

(function createManager() {
    "use strict";
    if (typeof window.AMPTManager === "undefined") {
        try{
            window.AMPTManager = {
                activeRegistry: -1,
                debug: false,
                networkId: '8663477',
                capTargeting: { adTargets: {}, slotTargets: {} },
                userID: null,
                docDomain: "",
                adTileIDGroup: [],
                tileExemptions: [],
                existingDivs: [],
                clearedDivs: [],
                newTileIDIteration: 0,
                requestSent: false,
                slotCount: 0,
                pageSlots: [],
                pageSlotsObj: {},
                clientWidth: 0,
                passedTargeting: [],
                requestScriptText: [],
                initialized: false,
                focused: true,
                refreshOnFocusOnly: false,

                // Adds a cross-browser listener for an event on the specified element
                addEvent: function (element, event, fn) {
                    if (element.addEventListener){
                        element.addEventListener(event, fn, false);
                    }else if (element.attachEvent) {
                        element.attachEvent('on' + event, fn);
                    }
                },
                // Initializes AMPTManager
                init: function () {
                    var MyArr = function() {
                        var arr = [];
                        arr.push = function() {                        
                            var res = Array.prototype.push.apply(this, arguments);
                            AMPTManager.networkId = AMPTManager.registry[res - 1][0].gpt_id;                        
                            AMPTManager.activeRegistry = res - 1;
                            AMPTManager.setCapTargeting(res-1);
                            AMPTManager.registry[res - 1][0].requested = false;
                            var rktrPageId = AMPTManager.registry[res-1][0].rktr_id;
                            if (window.domLoadEventFired == true){
                                AMPTManager.requestAndRenderAds();                    
                            }
                            return res;
                        }
                        return arr;
                    };
                    AMPTManager.registry = new MyArr;
                    AMPTManager.getViewportDimensions();
                    AMPTManager.setFocusListener();
                    AMPTManager.setSlotRenderedListener();
                    this.initialized = true;
                },
                setSlotRenderedListener: function(){
                    googletag.cmd.push(function(){
                        googletag.pubads().addEventListener('slotRenderEnded', function(event) {
                            var renderCompleteEvent = new CustomEvent('GPTRenderComplete', {"detail": {"asset": event.slot, "pos": event.slot.getTargeting("pos"), "empty": event.isEmpty}});
                            document.dispatchEvent(renderCompleteEvent);
                        });
                    });
                },
                // Sets CAP/Dynamic targeting values based on JSON object
                setCapTargeting: function(regIndex){
                    var siteLvl;
                    if (typeof AMPTManager.registry[regIndex][0].root !== "undefined"){
                        siteLvl = AMPTManager.registry[regIndex][0].root.toUpperCase();
                    }else{
                        siteLvl = AMPTManager.registry[regIndex][0].site.toUpperCase();
                    }
                    AMPTManager.registry[regIndex][0].capTargeting = { adTargets: [], slotTargets: {} };
                    if (typeof window[siteLvl] !== "undefined"){
                        AMPTManager.capTargeting.adTargets = window[siteLvl].adTargets ? JSON.parse(JSON.stringify(window[siteLvl].adTargets)) : [];
                        AMPTManager.capTargeting.slotTargets = window[siteLvl].slotTargets ? JSON.parse(JSON.stringify(window[siteLvl].slotTargets)) : {};
                        AMPTManager.registry[regIndex][0].capTargeting = AMPTManager.capTargeting;
                        for (var target in AMPTManager.capTargeting){
                            if (AMPTManager.capTargeting.hasOwnProperty(target)){
                                if (AMPTManager.passedTargeting.indexOf(target) < 0){
                                    AMPTManager.passedTargeting.push(target);
                                }
                            }
                        }
                        AMPTManager.capTargeting = AMPTManager.registry[regIndex][0].capTargeting;
                    }                
                },
                // Dynamically adds a page-level target.
                addPageLevelTarget: function(key, value){
                    var targeting = AMPTManager.capTargeting;
                    targeting.adTargets[key] = value;                
                    AMPTManager.capTargeting = targeting;
                    try{
                        googletag.pubads().setTargeting(key, value);
                    }catch(err){
                        AMPTManager.logit({error_calling_setTargeting: err});
                    }
                },
                // Dynamically removes a page-level target.
                removePageLevelTarget: function(key){
                    var targeting = AMPTManager.capTargeting;
                    delete targeting.adTargets[key];
                    AMPTManager.capTargeting = targeting;
                    try{
                        googletag.pubads().clearTargeting(key);
                    }catch(err){
                        AMPTManager.logit({error_calling_clearTargeting: err});
                    }
                },
                // Dynamically adds a slot-level target.
                addSlotLevelTarget: function(slotId, key, value){
                    var targeting = AMPTManager.capTargeting;
                    targeting.slotTargets[slotId][key] = value;                
                    AMPTManager.capTargeting = targeting;
                    AMPTManager.pageSlotsObj[slotId].setTargeting(key, value);
                },
                // Dynamically removes all slot-level targets.
                removeSlotLevelTargets: function(slotId){
                    var targeting = AMPTManager.capTargeting;
                    targeting.slotTargets[slotId] = {};
                    AMPTManager.capTargeting = targeting;
                    var pos = AMPTManager.pageSlotsObj[slotId].getTargeting("pos");
                    AMPTManager.pageSlotsObj[slotId].clearTargeting();
                    AMPTManager.addSlotLevelTarget(slotId, "pos", pos);
                },
                // Sets a listener for focus and blur events on the window object
                setFocusListener: function() {
                    AMPTManager.addEvent(window, 'focus', function(){
                        AMPTManager.focused = true;
                    });
                    AMPTManager.addEvent(window, 'blur', function(){
                        AMPTManager.focused = false;
                    });
                },
                // Gets viewport width and height using document.documentElement.clientWidth/Height
                getViewportDimensions: function(){
                    AMPTManager.clientWidth = document.documentElement.clientWidth;
                    AMPTManager.clientHeight = document.documentElement.clientHeight;
                    AMPTManager.windowOrientation = window.orientation ? window.orientation : 0;
                    if (AMPTManager.windowOrientation == 90 || AMPTManager.windowOrientation == -90){
                        if (AMPTManager.clientWidth < AMPTManager.clientHeight){
                            AMPTManager.clientWidth = AMPTManager.clientHeight;
                            AMPTManager.clientHeight = document.documentElement.clientWidth;
                        }
                    }     
                },
                // Reads a value from a cookie
                readCookie: function (name) {
                    if (document.cookie === '') { 
                        // there is no cookie, so go no further
                        return null;
                    } else { // there is a cookie
                        var ca = document.cookie.split(';');
                        var nameEQ = name + "=";
                        for (var i = 0; i < ca.length; i++) {
                            var c = ca[i];
                            while (c.charAt(0) == ' ') c = c.substring(1, c.length); //delete spaces
                            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
                        }
                        return null;
                    }
                },
                // Debug log messages
                logit: function (msg, groupTitle) {
                    if (window.location.href.indexOf("debug=true") > -1 || AMPTManager.debug == true) {
                        groupTitle = groupTitle ? groupTitle : "MESSAGE FROM ADFUEL.JS: "
                        if (typeof console !== "undefined" && typeof console.log !== "undefined") {
                            console.group(groupTitle);
                            if (typeof msg === "string") {
                                console.log(msg);
                            } else {
                                console.dir(msg);
                            }
                            console.groupEnd();
                        }
                    }
                },
                // Convert an object to an array
                convertToArray: function (obj) {
                    var returnArr = [], 
                        key;
                    for (key in obj) {
                        returnArr.push([key, obj[key]]);
                    }
                    return returnArr;
                },
                // Adds dynamic targeting to the specified slot
                addContentTargeting: function(slotId, key, value){
                    var targetObj = {};
                    targetObj[slotId] = [];
                    targetObj[slotId].push(key);
                    targetObj[slotId].push(value);
                    AMPTManager.capTargeting.push(targetObj);
                },
                // Adds targeting to a slot object
                addTargetingToSlot: function (reg, slotId, targeting) {
                    var slotIndex, slot, existIndex, targetIndex, existingTargeting, key, value, targetKey, valueToAdd, exists, p;
                    if (Array.isArray(targeting[0]) === false) {
                        targeting = [targeting];
                    }
                    
                    // At this point, the targeting variable should be an array of arrays.
                    // Loop through each slot in the registry
                    for (slotIndex in reg) {
                        slot = reg[slotIndex];
                        
                        // Check if the registry slot id matches the supplied slot id...");
                        if (slot.rktr_slot_id == slotId) {
                            
                            // Get the existing targeting from the registry.");
                            existingTargeting = slot.targeting;
                            if (Array.isArray(existingTargeting) === false) {
                                existingTargeting = [existingTargeting];
                            }
                            
                            // The existing targeting should now be an array of arrays.");
                            for (targetIndex in targeting) {
                                exists = false;

                                // Loop through the supplied targeting.");
                                // Get the target key/value to be added.");
                                targetKey = targeting[targetIndex][0];
                                valueToAdd = targeting[targetIndex][1];

                                // Loop through the existing targeting.");
                                for (existIndex in existingTargeting) {

                                    // Set the boolean check to false so that the k/v pair can be added if it doesn't exist.");
                                    // Get the key and value of each existing target");
                                    key = existingTargeting[existIndex][0];
                                    value = existingTargeting[existIndex][1];

                                    // Check if the target key matches the existing key.");
                                    if (key == targetKey) {
                                        exists = true;

                                        // If the key exists and the value is not an array, turn it into an array.");
                                        if (Array.isArray(value) != true) {
                                            value = [value];
                                        }

                                        // Existing targeting values should now be an array.");
                                        //Check if the value to add is an array and if so, loop through each value and push if the value doesn't already exist.");
                                        if (Array.isArray(valueToAdd)) {
                                            for (p in valueToAdd) {
                                                if (value.indexOf(valueToAdd[p]) < 0) {

                                                    // Add value to array.");
                                                    value.push(valueToAdd[p]);
                                                }
                                            }
                                        } else {

                                            //Else, push the value to add to the existing value array if it doesn't exist.");
                                            if (value.indexOf(valueToAdd) < 0) {

                                                // Add value to array.");
                                                value.push(valueToAdd);
                                            }
                                        }

                                        // Add the value back into the existingTargeting Array and set the boolean.");
                                        existingTargeting[existIndex][1] = value;
                                    }
                                }

                                // The key didn't already exist so push the key and value to the existingTargeting array.");
                                if (exists === false) {
                                    existingTargeting.push([targetKey, valueToAdd]);
                                    exists = true;
                                }

                                // Add the existingTargets array back into the registry for the appropriate slot.");
                                reg[slotIndex].targeting = existingTargeting;
                            }
                        }
                    }
                    return reg;
                },
                // Combines CAP and page-level targeting 
                combineTargeting: function (reg, targeting) {
                    var key, value;
                    var pageLevel = reg[0];
                    for (var i in targeting.adTargets){
                        if (targeting.adTargets.hasOwnProperty(i)){
                            var key = i;
                            var value = targeting.adTargets[key];
                            if (value == true || value == false){
                                value = String(value);
                            }
                        }
                        pageLevel.targeting.push([key, value]);                    
                    }
                    reg[0] = pageLevel;        
                    if (typeof pageLevel.orig_slot_id !== "undefined"){
                        for (var i in targeting.slotTargets){
                            if (targeting.slotTargets.hasOwnProperty(i)){
                                var slotId = i;
                                if (slotId == pageLevel.orig_slot_id){
                                    for (var j in targeting.slotTargets[i]){
                                        if (targeting.slotTargets[i].hasOwnProperty(j)){
                                            var key = j;
                                            var value = targeting.slotTargets[i][j];
                                            if (value == true || value == false){
                                                value = String(value);
                                            }
                                        }
                                        reg[1].targeting.push([key, value]);
                                    }
                                }
                            }
                        }
                    }else{
                        for (var slotIndex = 1; slotIndex < reg.length; slotIndex++){
                            var slot = reg[slotIndex];
                            for (var i in targeting.slotTargets){
                                if (targeting.slotTargets.hasOwnProperty(i)){
                                    var slotId = i;
                                    if (slotId == slot.rktr_slot_id){
                                        for (var j in targeting.slotTargets[i]){
                                            if (targeting.slotTargets[i].hasOwnProperty(j)){
                                                var key = j;
                                                var value = targeting.slotTargets[i][j];
                                                if (value == true || value == false){
                                                    value = String(value);
                                                }
                                            }
                                            slot.targeting.push([key, value]);
                                        }
                                    }
                                }
                            }
                            reg[slotIndex] = slot;
                        }
                    }
                    return reg;
                },
                // Increments the passed in div id
                incrementDivId: function(active, slotIndex){
                    var reg = this.registry;
                    var regSlot = reg[active][slotIndex];
                    var pageSlot = document.getElementById('ad-clear-script').previousElementSibling;
                    var divId = pageSlot.id;
                    var divIdArr = divId.split("_");                
                    var orig_inc = parseInt(divIdArr[divIdArr.length-1]);
                    var new_inc = orig_inc + 1
                    if (new_inc < 10){ 
                        new_inc = "0" + String(new_inc);
                        orig_inc = "0" + String(orig_inc)
                    }else{
                        new_inc = String(new_inc);
                        orig_inc = String(orig_inc);
                    }

                    divIdArr[divIdArr.length-1] = new_inc;
                    var divId = divIdArr.join("_");
                    regSlot.rktr_slot_id = divId;
                    pageSlot.id = pageSlot.id.replace(orig_inc, new_inc);
                    AMPTManager.logit({regSlot: regSlot, pageSlot: pageSlot});
                    this.registry[active][slotIndex] = regSlot;
                    if (AMPTManager.existingDivs.indexOf(pageSlot.id) < 0){
                        AMPTManager.existingDivs.push(pageSlot.id);
                    }
                    return true;
                },
                // Mangles div Ids if they already exist
                mangleDivId: function(active, slotIndex){
                    var reg = this.registry;
                    var current = this.registry[active][slotIndex];
                    if (typeof current !== "undefined" && current.rktr_slot_id.indexOf("ad_mod_") < 0){
                        var idArray = current.rktr_slot_id.split("_");
                        var incrementer = idArray[idArray.length-1];
                        var orig_slot_id = idArray.join("_");
                        var temp_slot_id = idArray.join("_");
                        AMPTManager.logit(orig_slot_id, "Mangling Div Id");
                        while(this.existingDivs.indexOf(temp_slot_id) >= 0){
                            incrementer = parseInt(incrementer) + 1;
                            if (incrementer < 10){ 
                                incrementer = "0" + String(incrementer);
                            }else{
                                incrementer = String(incrementer);
                            }
                            idArray[idArray.length-1] = incrementer;
                            temp_slot_id = idArray.join("_");
                        }
                        AMPTManager.logit(temp_slot_id, "Mangled Div Id");
                        current.rktr_slot_id = temp_slot_id;
                        var pageSlots = document.querySelectorAll("div#"+orig_slot_id);
                        if (pageSlots.length > 1){
                            var secondEl = document.querySelectorAll("div#"+orig_slot_id)[1];
                            secondEl.id = temp_slot_id;
                        }
                        this.registry[active][slotIndex] = current;
                        if (this.existingDivs.indexOf(temp_slot_id) < 0){
                            this.existingDivs.push(temp_slot_id);
                        }
                        return current.rktr_slot_id;
                    }else{
                        return "";
                    }
                },
                // Builds the addSize functions for the GPT request
                buildSlotMapping: function(id, responsive){
                    var mapping = 'var '+id+'_mapping = googletag.sizeMapping()\n';
                    for (var i = 0; i < responsive.length; i++){
                        var val = responsive[i];
                        mapping += '\t\t.addSize([' + val[0][0] + ', ' + val[0][1] + '], [';
                        for (var x = 0; x < val[1].length; x++){
                            var size = val[1][x];
                            if (size !== "suppress"){
                                mapping += '['+ size[0] +', ' + size[1] +'], ';
                            }
                        }
                        if (val[1][0] !== "suppress"){
                            mapping = mapping.substr(0, mapping.length-2);
                        }
                        mapping = mapping + "]";
                        mapping = mapping + ")\n";
                    }
                    mapping = mapping + "\t\t.build();";
                    return mapping;
                },
                // Adds the supplied URL to the head in a script tag
                processNewRegistry: function(url){
                    AMPTManager.logit(url, "Processing New Registry");
                    var regScr = document.createElement("script");
                    regScr.src = url;
                    regScr.type = "text/javascript";
                    var head = document.getElementsByTagName("head")[0];
                    head.appendChild(regScr);
                    AMPTManager.requestAndRenderAds();
                },
                // Generates random ID for single slots.
                generateMiniGUID: function(){
                    return 'xxxxyxxxx'.replace(/[xy]/g, function(c){
                        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
                        return v.toString(16);
                    }).toString();
                },
                clearSlot: function(divId){
                    AMPTManager.logit("CLEARING SLOT: " + divId);
                    var slotObj = AMPTManager.pageSlotsObj[divId];
                    AMPTManager.logit({div: divId, slot: slotObj}, "Clearing Slot");
                    if (typeof slotObj !== "undefined") {
                        try {
                            googletag.cmd.push(function(){
                                googletag.pubads().clear([slotObj]);
                                // delete AMPTManager.pageSlotsObj[divId];
                                var divIndex = AMPTManager.existingDivs.indexOf(divId);
                                AMPTManager.existingDivs.splice(divIndex, 1);
                                AMPTManager.logit({div: divId, slot: slotObj}, "Slot Cleared");
                                if (AMPTManager.clearedDivs.indexOf(divId) < 0){
                                    AMPTManager.clearedDivs.push(divId);
                                }
                            });
                        } catch (err) {
                            AMPTManager.logit({error_calling_clear: err});
                        }
                    }
                },
                clearSlots: function(divIds){
                    for (var divId in divIds){
                        var slotObj = AMPTManager.pageSlotsObj[divId];
                        if (typeof slotObj !== "undefined") {
                            try {
                                googletag.cmd.push(function(){
                                    googletag.pubads().clear([slotObj]);
                                    // delete AMPTManager.pageSlotsObj[divId];
                                    var divIndex = AMPTManager.existingDivs.indexOf(divId);
                                    AMPTManager.existingDivs.splice(divIndex, 1);
                                    AMPTManager.clearedDivs.push(divId);                                    
                                });
                            } catch (err) {
                                AMPTManager.logit({error_calling_clear: err});
                            }
                        }
                    }
                },
                clearAllSlots: function(){
                    try{
                        googletag.pubads().clear();
                    }catch(err){
                        AMPTManager.logit({error_calling_clear: err});
                    }
                    // AMPTManager.pageSlotsObj = {};
                    AMPTManager.clearedDivs = JSON.parse(JSON.stringify(existingDivs));
                    // AMPTManager.existingDivs = [];
                },
                // Renders a single slot
                renderSingleSlot: function(divId, size, targets, responsive, adunit, delay){
                    var x = 0;
                    if (this.initialized == false){
                        this.init();
                        while (this.initialized == false){
                            x++;
                            if (this.initialized == true || x > 1000){
                                break;
                            }
                        }
                    }
                    var networkId = AMPTManager.networkId;
                    var site;
                    var mangledDivId = "ad_mod_" + AMPTManager.generateMiniGUID();                
                    var divElement = document.getElementById(divId);
                    var divArray = document.querySelectorAll("div#"+divId);
                    var originalDiv = divId;
                    if (typeof divElement !== "undefined" && divArray.length > 1){
                        divElement.id = mangledDivId;
                        divId = mangledDivId;
                    }                
                    if (adunit.indexOf("/") >= 0){
                        site = adunit.split("/")[0];
                        if (parseInt(site) > 0){
                            networkId = site;
                            site = adunit.split("/")[1];                        
                            var adUnitArray = adunit.split("/");
                            adUnitArray.splice(0,1);
                            adunit = adUnitArray.join('/');
                        }                    
                    }else{
                        site = adunit;
                    }
                    var pageLevel = {
                        "rktr_slot_id": "page",
                        "rktr_id": "sponsoredAdPage",
                        "gpt_id": networkId,
                        "orig_slot_id": originalDiv,
                        "site": site,
                        "root": site,
                        "targeting": [],
                        "responsive": [],
                        "requested": false
                    };
                    if (document.location.search.indexOf("adsqa=") > 0) {
                        AMPTManager.passedTargeting.push("status");
                        var qaparam = this.getURLParam("adsqa").split("%3D");
                        pageLevel.targeting.push(["status", qaparam]);
                    }
                    var defaultPageLevelTargets = ["transId", "kuid", "ksg", "guid"];               
                    for (var tIndex=0; tIndex <= targets.length; tIndex++){
                        var target = targets[tIndex];
                        if (typeof target !== "undefined"){
                            if (defaultPageLevelTargets.indexOf(target[0]) >= 0){
                                pageLevel.targeting.push(target);
                                targets.splice(tIndex, 1);
                                tIndex = tIndex-1;
                            }
                        }
                    }                
                    for (var pIndex in pageLevel.targeting){
                        if (pageLevel.targeting.hasOwnProperty(pIndex)){
                            var pTarget = pageLevel.targeting[pIndex];
                            for (var tIndex=0; tIndex < targets.length; tIndex++){
                                if (targets.hasOwnProperty(tIndex)){
                                    var target = targets[tIndex];
                                    if (pTarget[0] == target[0]){
                                        targets.splice(tIndex,1);
                                        tIndex = tIndex-1;
                                    }
                                }
                            }
                        }
                    }
                    size = size ? size : [[88,31]];
                    targets = targets ? targets : [];
                    responsive = responsive ? responsive : [];
                    var regObj = {};
                    regObj.present = true;
                    regObj.responsive = responsive;
                    regObj.rktr_slot_id = divId;
                    regObj.sizes = size;
                    regObj.targeting = targets;
                    regObj.rktr_ad_id = adunit;
                    var reg = [pageLevel, regObj];
                    var index = AMPTManager.registry.push(reg);
                },
                // Builds the bulk of the request to be sent to DFP
                buildRequest: function (a, b) {
                    var scriptText, pageLevel, slotLevel, raw, slotIndex, slot, networkId, target, targetId, index;
                    this.targeting = b ? b : this.capTargeting;
                    var activeReg = a;
                    var reg = this.registry[a];

                    networkId = AMPTManager.networkId;
                    if (typeof reg !== "undefined"){
                        pageLevel = reg[0];
                        if (typeof pageLevel.requestScriptText === "undefined"){
                            reg = this.combineTargeting(reg, reg[0].capTargeting);
                            pageLevel.responsive = pageLevel.responsive ? pageLevel.responsive : {};
                            var scriptText = "";
                            scriptText += "googletag.cmd.push(function(){\n";
                            this.pageLevelSettings = pageLevel;
                            for (slotIndex = 1; slotIndex < reg.length; slotIndex++) {
                                slot = reg[slotIndex];
                                if (typeof document.getElementById(slot.rktr_slot_id) !== "undefined" && document.getElementById(slot.rktr_slot_id) != null) {
                                    var newIndex = this.slotCount;
                                    slot.present = true;
                                    slot.index = this.slotCount;
                                    var renderThisAd = true;
                                    AMPTManager.logit({existing: AMPTManager.existingDivs, cleared: AMPTManager.clearedDivs});
                                    if (this.existingDivs.indexOf(slot.rktr_slot_id) >= 0){
                                        this.mangleDivId(activeReg, slotIndex);
                                    }
                                    AMPTManager.logit({slot: slot.rktr_slot_id});
                                    if (this.clearedDivs.indexOf(slot.rktr_slot_id) >= 0){
                                        this.incrementDivId(activeReg, slotIndex);
                                    }
                                    if (renderThisAd == true){
                                        if (this.existingDivs.indexOf(slot.rktr_slot_id) < 0){
                                            this.existingDivs.push(slot.rktr_slot_id);
                                        }
                                        if (slot.rktr_slot_id.indexOf("_oop") >= 1){
                                            scriptText += "\tAMPTManager.pageSlotsObj['"+slot.rktr_slot_id+"'] = googletag.defineOutOfPageSlot(\'/" + networkId + "/"+ slot.rktr_ad_id + "', '" + slot.rktr_slot_id + "')\n";
                                        }else{
                                            scriptText += "\tAMPTManager.pageSlotsObj['"+slot.rktr_slot_id+"'] = googletag.defineSlot(\'/" + networkId + "/" + slot.rktr_ad_id + "', " + JSON.stringify(slot.sizes) + ", '" + slot.rktr_slot_id + "')\n";
                                        }
                                        scriptText += "\t\t.addService(googletag.pubads())\n";
                                        var slotTargeting = slot.targeting;
                                        if (Array.isArray(slotTargeting) === false) {
                                            slotTargeting = [slotTargeting];
                                        }
                                        for (target in slotTargeting) {
                                            if (slotTargeting.hasOwnProperty(target)){
                                                var targetValue;
                                                if (typeof slotTargeting[target] !== "undefined"){
                                                    targetValue = JSON.stringify(slotTargeting[target][1]);  
                                                }else{
                                                    targetValue = "";
                                                }
                                                if (typeof targetValue !== "undefined" && targetValue != ""){
                                                    try{
                                                        targetValue = targetValue.replace(/"/g, "'", true);
                                                    }catch(err){
                                                    }
                                                    if (slotTargeting[target][0] == "exclusions"){
                                                        if (slotTargeting[target][1].isArray() == true){
                                                            for (var targetIndex in slotTargeting[target][1]){
                                                                targetValue = slotTargeting[target][1][targetIndex];
                                                                scriptText += "\t\t.setCategoryExclusion('"+targetValue+"')";
                                                            }
                                                        }else{
                                                            scriptText += "\t\t.setCategoryExclusion('"+targetValue+"')";
                                                        }
                                                    }else{
                                                        scriptText += "\t\t.setTargeting('" + slotTargeting[target][0] + "', ";
                                                        scriptText += targetValue + ")";
                                                    }
                                                    if (target == slotTargeting.length - 1){
                                                        scriptText += ";";
                                                    }
                                                    scriptText += "\n";
                                                }
                                            }
                                        }
                                        slot.responsive = slot.responsive ? slot.responsive : [];
                                        if (slot.responsive.length > 0){
                                            var mapping = this.buildSlotMapping(slot.rktr_slot_id, slot.responsive);
                                            scriptText += '\t' + mapping + "\n";
                                            scriptText += '\tAMPTManager.pageSlotsObj["'+slot.rktr_slot_id+'"].defineSizeMapping('+slot.rktr_slot_id+'_mapping);\n';
                                        }
                                        this.slotCount++;
                                    }
                                }else{
                                    // Slot does not exist.  Do not request ad.
                                    AMPTManager.logit(slot.rktr_slot_id, "Div ID is not present.");
                                }
                                reg[slotIndex] = slot;
                            }
                            this.registry[activeReg] = reg;
                            scriptText += "\tgoogletag.pubads()\n";
                            var latlong = AMPTManager.readCookie("gptgeo");
                            AMPTManager.logit({latlong1: latlong});
                            if (latlong != null){
                                AMPTManager.logit({latlong2: latlong});
                                latlong = latlong.split("%2C");
                                AMPTManager.logit({latlong3: latlong});
                                scriptText += "\t\t.setLocation("+parseFloat(latlong[0])+","+parseFloat(latlong[1])+")\n";
                            }else{
                                AMPTManager.logit("Unable to retrieve location cookie.");
                            }
                            for (targetId in pageLevel.targeting) {
                                var targetValue = pageLevel.targeting[targetId][1];
                                if (typeof targetValue !== "undefined" && typeof targetValue !== "function" && targetValue != null && targetValue != ""){
                                    try{
                                        targetValue = targetValue.replace(/"/g, "'", true);
                                    }catch(err){
                                    }
                                    if (pageLevel.targeting[targetId][0] == "exclusions"){
                                        if (pageLevel.targeting[targetId][1].isArray() == true){
                                            for (var targetIndex in pageLevel.targeting[targetId][1]){
                                                targetValue = pageLevel.targeting[targetId][1][targetIndex];
                                                scriptText += "\t\t.setCategoryExclusion('"+targetValue+"')\n";
                                            }
                                        }else{
                                            scriptText += "\t\t.setCategoryExclusion('"+targetValue+"')\n";
                                        }
                                    }else{
                                        scriptText += "\t\t.setTargeting('" + pageLevel.targeting[targetId][0] + "', ";
                                    }
                                    if (targetValue.indexOf(',') >= 0){
                                        targetValue = targetValue.split(',');
                                    }
                                    if (Array.isArray(targetValue) == false){
                                        targetValue = [targetValue];
                                    }
                                    scriptText +=  JSON.stringify(targetValue) + ")";
                                    scriptText += "\n";
                                }
                                if (targetId == pageLevel.targeting.length - 1) {
                                    if (document.location.search.indexOf("adsqa=") > 0) {
                                        AMPTManager.passedTargeting.push("status");
                                        var qaparam = this.getURLParam("adsqa").split("%3D");
                                        scriptText += "\t\t.setTargeting('" + decodeURIComponent(qaparam[0]) + "', '" + decodeURIComponent(qaparam[1]) + "');\n";
                                    }
                                }
                            }
                            if (typeof pageLevel.singleSlot == "undefined"){
                                scriptText += "\tgoogletag.pubads().collapseEmptyDivs(true);\n";
                                scriptText += "\tgoogletag.pubads().enableSingleRequest();\n";
                                // scriptText += "\tgoogletag.pubads().enableAsyncRendering();\n";
                                scriptText += "\tgoogletag.pubads().disableInitialLoad();\n";
                            }
                            scriptText += "\tgoogletag.enableServices();\n";
                            scriptText += "});";
                            this.requestScriptText.push(scriptText);
                            reg[0].requestScriptText = scriptText;
                            AMPTManager.logit(scriptText, "Generated GPT Request");
                            return scriptText;
                        }
                    }
                },
                // Sends the request built in AMPTManager.buildRequest to DFP
                sendRequest: function (regIndex) {
                    var reg = AMPTManager.registry[regIndex];
                    if (typeof reg !== "undefined" && typeof reg[0] !== "undefined" && reg[0].requested == false){
                        if (typeof reg[0].requestScriptText === "undefined"){
                            reg[0].requestScriptText = AMPTManager.buildRequest(regIndex, AMPTManager.capTargeting);
                        }
                        var scriptText = reg[0].requestScriptText;
                        var script, node;
                        script = document.createElement("script");
                        script.type = "text/javascript";
                        script.text = this.requestScriptText[this.requestScriptText.length-1];
                        node = document.getElementsByTagName("head")[0];
                        AMPTManager.logit(script, "Sending GPT Request");
                        node.appendChild(script);
                        reg[0].requested = true;
                        AMPTManager.requestSent = true;
                    }else{
                        if (typeof reg !== "undefined"){
                            var scriptText = reg[0].requestScriptText;
                        }
                    }
                },
                // Displays the ads that have been requested.
                displayAds: function (activeRegistry) {
                    AMPTManager.logit(activeRegistry, "Displaying Ads For Registry")
                    var registry = this.registry[activeRegistry];
                    var slotIds = [];
                    for (var x = 1; x < registry.length; x++) {
                        var slot = registry[x];
                        AMPTManager.logit(slot, "Attempting to Display Slot");
                        if (this.existingDivs.indexOf(slot.rktr_slot_id) >= 0){
                            slotIds.push(slot.rktr_slot_id);
                            if (typeof document.getElementById(slot.rktr_slot_id) !== "undefined" && document.getElementById(slot.rktr_slot_id) != null) {
                                AMPTManager.logit(slot.rktr_slot_id, "Displaying Slot");
                                googletag.cmd.push(function () {
                                    googletag.display(slot.rktr_slot_id);
                                });
                            }
                        }
                    }
                    var slots = [];
                    for (var slotId in AMPTManager.pageSlotsObj){                    
                        AMPTManager.logit(slotId, "Attempting to Refresh Slot");
                        AMPTManager.logit({slotIds: slotIds, index: slotIds.indexOf(slotId)}, "Checking for Slot Id in slotIds");
                        if (AMPTManager.pageSlotsObj.hasOwnProperty(slotId) && slotIds.indexOf(slotId) >= 0){
                            var slot = AMPTManager.pageSlotsObj[slotId];
                            slots.push(slot);
                        }
                    }
                    try{
                        AMPTManager.logit({slots: slots, slotIds: slotIds}, "Refreshing Slots");
                        googletag.pubads().refresh(slots);
                    }catch(err){
                        AMPTManager.logit({error_calling_refresh: err});                        
                    }
                },
                // Calls DFP's refresh ad functionality with the supplied div Id (if any)
                reloadAd: function(divId, pageload, updateCorrelator){
                    if (AMPTManager.focused == true || AMPTManager.refreshOnFocusOnly == false){
                        updateCorrelator = updateCorrelator ? updateCorrelator : false;
                        pageload = pageload ? pageload : false;
                        if (updateCorrelator != false){
                            try{
                                googletag.pubads().updateCorrelator();
                            }catch(err){
                                AMPTManager.logit({error_calling_updateCorrelator: err});
                            }
                        }
                        if (pageload != false){
                            AMPTManager.pageSlotsObj[divId].setTargeting("pageload", "ref");
                            try{
                                googletag.pubads().setTargeting("pageload", "ref");
                            }catch(err){
                                AMPTManager.logit({error_calling_setTargeting: err});
                            }
                            AMPTManager.passedTargeting.push("pageload");
                        }else{
                            if (AMPTManager.passedTargeting.indexOf("pageload") >= 0){
                                AMPTManager.pageSlotsObj[divId].setTargeting("pageload", "");
                                try{
                                    googletag.pubads().clearTargeting("pageload");
                                }catch(err){
                                    AMPTManager.logit({error_calling_clearTargeting: err});
                                }
                                AMPTManager.passedTargeting.splice(passedTargeting.indexOf("pageload"), 1);
                            }
                        }
                        try{
                            googletag.pubads().refresh([AMPTManager.pageSlotsObj[divId]]);
                        }catch(err){
                            AMPTManager.logit({error_calling_refresh: err});
                        }
                    }
                },
                // Calls reloadAd to refresh the supplied Div Id
                refreshAd: function(divId, interval, pageload, updateCorrelator){
                    if (AMPTManager.focused == true || AMPTManager.refreshOnFocusOnly == false){
                        updateCorrelator = updateCorrelator ? updateCorrelator : true;
                        pageload = pageload ? pageload : false;
                        interval = interval ? interval : 0;
                        if (typeof interval !== "undefined" && parseInt(interval) > 0){
                            interval = parseInt(interval);
                            (function(divId, interval, updateCorrelator, pageload){setInterval(function(){AMPTManager.reloadAd(divId, pageload, updateCorrelator)}, interval*1000);})(divId, interval, updateCorrelator, pageload);
                        }else{
                            (function(divId, updateCorrelator, pageload){AMPTManager.reloadAd(divId, pageload, updateCorrelator);})(divId, updateCorrelator, pageload);
                        }
                        return pageload;
                    }
                },
                // Calls reloadAd to refresh the supplied Div Ids
                refreshAds: function(divIds, interval, pageload, updateCorrelator){
                    if (AMPTManager.focused == true || AMPTManager.refreshOnFocusOnly == false){                
                        updateCorrelator = updateCorrelator ? updateCorrelator : true;
                        pageload = pageload ? pageload : false;
                        interval = interval ? interval : 0;
                        if (divIds.length > 1){
                            (function(divIds, interval, updateCorrelator, pageload){
                                var slots = [];
                                for (var divIndex in divIds){
                                    if (divIds.hasOwnProperty(divIndex)){
                                        var divId = divIds[divIndex];
                                        var slot = AMPTManager.pageSlotsObj[divId];
                                        slots.push(slot);
                                    }
                                }
                                if (typeof interval !== "undefined" && parseInt(interval) > 0){
                                    interval = parseInt(interval);
                                    (function(slots, interval, updateCorrelator, pageload){
                                        setInterval(function(){
                                            if (updateCorrelator != false){
                                                try{
                                                    googletag.pubads().updateCorrelator();
                                                }catch(err){
                                                    AMPTManager.logit({error_calling_updateCorrelator: err});
                                                }
                                            }
                                            if (pageload != false){
                                                try{
                                                    googletag.pubads().setTargeting("pageload", "ref");
                                                }catch(err){
                                                    AMPTManager.logit({error_calling_setTargeting: err});
                                                }
                                            }
                                            try{
                                                googletag.pubads().refresh(slots);
                                            }catch(err){
                                                AMPTManager.logit({error_calling_refresh: err});
                                            }
                                        }, interval*1000);
                                    })(slots, interval, updateCorrelator, pageload);
                                }else{
                                    (function(slots, updateCorrelator, pageload){
                                        if (updateCorrelator != false){
                                            try{
                                                googletag.pubads().updateCorrelator();
                                            }catch(err){
                                                AMPTManager.logit({error_calling_updateCorrelator: err});
                                            }
                                        }
                                        if (pageload != false){
                                            try{
                                                googletag.pubads().setTargeting("pageload", "ref");
                                            }catch(err){
                                                AMPTManager.logit({error_calling_setTargeting: err});
                                            }
                                        }
                                        try{
                                            googletag.pubads().refresh(slots);
                                        }catch(err){
                                            AMPTManager.logit({error_calling_refresh: err});
                                        }
                                    })(slots, updateCorrelator, pageload);
                                }
                            })(divIds, interval, updateCorrelator, pageload);
                        }
                        return pageload;
                    }
                },
                // Calls reload ad to refresh all Div Ids on the page
                refreshAllAds: function(interval, pageload, updateCorrelator){
                    if (AMPTManager.focused == true || AMPTManager.refreshOnFocusOnly == false){
                        updateCorrelator = updateCorrelator ? updateCorrelator : true;
                        pageload = pageload ? pageload : false;
                        interval = interval ? interval : 0;                
                        var slots = [];
                        for (var slotId in AMPTManager.pageSlotsObj){
                            if (AMPTManager.pageSlotsObj.hasOwnProperty(slotId)){
                                if (typeof document.getElementById(slotId) !== "undefined" && document.getElementById(slotId) != null){
                                    var slot = AMPTManager.pageSlotsObj[slotId];
                                    slots.push(slot);
                                }else{
                                    delete AMPTManager.pageSlotsObj[slotId];
                                }
                            }
                        }
                        (function(slots, interval, updateCorrelator, pageload){
                            if (typeof interval !== "undefined" && parseInt(interval) > 0){
                                interval = parseInt(interval);
                                (function(slots, interval, updateCorrelator){
                                    setInterval(function(){
                                        if (updateCorrelator != false){
                                            try{
                                                googletag.pubads().updateCorrelator();
                                            }catch(err){
                                                AMPTManager.logit({error_calling_updateCorrelator: err});
                                            }
                                        }
                                        if (pageload != false){
                                            try{
                                                googletag.pubads().setTargeting("pageload", "ref");
                                            }catch(err){
                                                AMPTManager.logit({error_calling_setTargeting: err});
                                            }
                                        }else{
                                            try{
                                                googletag.pubads().clearTargeting("pageload");
                                            }catch(err){
                                                AMPTManager.logit({error_calling_clearTargeting: err});
                                            }
                                        }
                                        try{
                                            googletag.pubads().refresh(slots);
                                        }catch(err){
                                            AMPTManager.logit({error_calling_refresh: err});
                                        }
                                    }, interval*1000);
                                })(slots, interval, updateCorrelator, pageload);
                            }else{
                                (function(slots, updateCorrelator, pageload){
                                    if (updateCorrelator != false){
                                        try{
                                            googletag.pubads().updateCorrelator();
                                        }catch(err){
                                            AMPTManager.logit({error_calling_updateCorrelator: err});
                                        }
                                    }
                                    if (pageload != false){
                                        try{
                                            googletag.pubads().setTargeting("pageload", "ref");
                                        }catch(err){
                                            AMPTManager.logit({error_calling_setTargeting: err});
                                        }
                                    }else{
                                        try{
                                            googletag.pubads().clearTargeting("pageload");
                                        }catch(err){
                                            AMPTManager.logit({error_calling_clearTargeting: err});
                                        }
                                    }                                
                                    try{
                                        googletag.pubads().refresh(slots);
                                    }catch(err){
                                        AMPTManager.logit({error_calling_refresh: err});
                                    }
                                })(slots, updateCorrelator, pageload);
                            }
                        })(slots, interval, updateCorrelator, pageload);
                        return pageload;
                    }
                },
                // Gets the value of a querystring parameter
                getURLParam: function (name) {
                    name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
                    var regexS = "[\\?&]" + name + "=([^&#]*)";
                    var regex = new RegExp(regexS);
                    var results = regex.exec(window.location.href);
                    if (results === null) {
                        return "";
                    } else {
                        return results[1];
                    }
                },
                // Builds and sends the request to DFP
                requestAndRenderAds: function(){
                    for (var regIndex = 0; regIndex < AMPTManager.registry.length; regIndex++){
                        var innerReg = AMPTManager.registry[regIndex];
                        if (typeof innerReg !== "undefined" && typeof innerReg[0] !== "undefined"){
                            var scriptText = AMPTManager.buildRequest(regIndex, AMPTManager.registry[regIndex][0].capTargeting);
                            if (innerReg[0].requested == false){
                                AMPTManager.logit(innerReg, "Requesting and Rendering Ads");
                                AMPTManager.sendRequest(regIndex);
                                innerReg[0].requested = true;
                                googletag.cmd.push(function(){
                                    AMPTManager.displayAds(regIndex);
                                    try{
                                        googletag.pubads().updateCorrelator();
                                    }catch(err){
                                        console.group("Error calling UpdateCorrelator");
                                        console.dir(err);
                                        console.log("If you see this error, the GPT Library has not fully loaded and the correlator cannot be updated.");
                                        console.log("Please notify rocketeerdevs@turner.com with the details of the error.");
                                        console.groupEnd();
                                    }
                                });
                                var requestCompleteEvent = new CustomEvent('AdFuelRequestComplete', {"detail": {"asset": innerReg}});
                                document.dispatchEvent(requestCompleteEvent);
                            }
                        }
                    }                        
                }
            };
        }catch(err){
            console.group("Error creating the AMPTManager object.");
            console.dir(err);
            console.log("If you see this error, a problem occurred when creating the main AMPTManager object.");
            console.log("Please notify rocketeerdevs@turner.com with the details of the error.");
            console.groupEnd();
        }
    }
})();
if (AMPTManager.initialized == false){
    AMPTManager.init();
}
AMPTManager.addEvent(window, 'load', function(){
    AMPTManager.requestAndRenderAds();
});
AMPTManager.addEvent(document, 'AdFuelRequestComplete', function(e){AMPTManager.logit({requestEvent: e});});
AMPTManager.addEvent(document, 'GPTRenderComplete', function(e){AMPTManager.logit({renderEvent: e});});

