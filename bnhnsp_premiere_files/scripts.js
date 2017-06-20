(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var VIDEO_ID = 'ZHOijpncT9WPtVrMWGDXng';

$(function () {
    var player = new ASVideoPlayer('as-video-player', VIDEO_ID, { autoplay: false });
    var pollURL = 'http://poll.turner.com/ViewsFlash/servlet/viewsflash';
    var $clip = $('.sp-clip');

    if (!localStorage.getItem('HNSPSurvey')) {
        $('#will_you_enjoy').show();

        player.registerEvent('ended', function () {
            $('#page-content').hide();
            $('#did_you_enjoy').show();
        });

        $clip.each(function () {
            var _this = this;

            $(this).on('click', function () {
                $(_this).addClass('selected');

                setTimeout(function () {
                    var id = $(_this).closest('.poll-container').attr('id');
                    var value = $(_this).data('value');
                    var inputData = $('#formAdultSwimJSONHNSPPoll').serialize();

                    inputData = id + '=' + value + '&' + inputData;

                    submitPoll(inputData);

                    if (id == 'will_you_enjoy') {
                        $('#will_you_enjoy').hide();
                        $('#page-content').show();
                        player.getPlayer().play();
                    }

                    if (id == 'did_you_enjoy') {
                        $('#page-content').show();
                        $('#did_you_enjoy').hide();

                        localStorage.setItem('HNSPSurvey', true);
                    }
                }, 1000);
            });
        });
    } else {
        $('#will_you_enjoy').hide();
        $('#page-content').show();
        player.getPlayer().play();
    }

    var jsonp_results = function jsonp_results(results) {
        console.log(results);
    };

    function submitPoll(data) {
        $.ajax({
            url: pollURL,
            data: data,
            type: 'post',
            dataType: 'jsonp',
            jsonpCallback: 'jsonp_results',
            success: function success(response) {
                console.log(response);

                jsonp_results(response);
            },
            error: function error(jqXHR, textStatus, errorThrown) {
                console.log(jqXHR, textStatus, errorThrown);
            }
        });
    }
});

},{}]},{},[1]);
