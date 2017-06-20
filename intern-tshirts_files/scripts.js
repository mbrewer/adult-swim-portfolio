(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var VIDEO_ID = 'PHV6E3eoR9-CQM9pQfHPlg';

$(function () {
    new ASVideoPlayer('Player', VIDEO_ID);

    var pollURL = 'http://poll.turner.com/ViewsFlash/servlet/viewsflash';
    var $contestant = $('.contestant');
    var voted = false;

    $contestant.each(function () {
        var _this = this;

        $(this).on('click', function () {
            if (voted) return;

            var $input = $(_this).find('input');
            var isChecked = $input.prop('checked');

            $input.prop('checked', !isChecked);

            var inputData = $('#formAdultSwimJSONMrPicklesTalent').serialize();

            submitPoll(inputData);
        });

        if (!window.Modernizr.touch) $(this).find('img').freezeframe();
    });

    var jsonp_results = function jsonp_results(results) {
        voted = true;

        for (var i = 0; i < results.questions.length; i++) {
            for (var j = 0; j < results.questions[i].answers.length; j++) {
                var id = results.questions[i].answers[j].value;
                var percent = results.questions[i].answers[j].percent + '%';
                var $contestant = $('.contestant[data-id="' + id + '"]');
                var $percentage = $('.contestant[data-id="' + id + '"]').find('.percentage .text');

                $contestant.addClass('voted');
                $percentage.text(percent);
            }
        }
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
