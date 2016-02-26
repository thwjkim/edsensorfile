/*
 * Copyright (c) 2015, Daliworks. All rights reserved.
 *
 * Reproduction and/or distribution in source and binary forms 
 * without the written consent of Daliworks, Inc. is prohibited.
 *
 */
//This is for git
'use strict';
var five = require('johnny-five'),
Edison = require('edison-io'),
_ = require('lodash'),
util = require('util'),
events = require('events'),
logger = require('log4js').getLogger('Sensor');

var ADC = 5; // 5V
var GROVE_VCC = 5; // 5V
var ROTARY_ANGLE_FULL_ANGLE = 300;
var SOILMOISTURE_MAX = 650;

function EdisonSensors() {
  var self = this;
  this.sensors = {};
  this.actions = {};

  var board = new five.Board(
    {
      io: new Edison(),
      repl: false
    }
  );
  board.on('ready', function() {
    var sensors = self.sensors;

    sensors.light = { instance: new five.Sensor('A0') };
    sensors.sound = { instance: new five.Sensor('A1') };
    //sensors.soilMoisture = { instance: new five.Sensor('A1') };
    sensors.rotary = { instance: new five.Sensor('A2') };
    //sensors.vibration = { instance: new five.Sensor('A2') };
    sensors.temperature = { instance: new five.Temperature({ pin: 'A3', controller: 'GROVE' }) };
    sensors.buzzer = { instance: new five.Pin(2) };
    sensors.led = { instance: new five.Led(3) };
    sensors.relay = { instance: new five.Relay(4) };
    sensors.button = { instance: new five.Button(5) };
    sensors.touch = { instance: new five.Button(6) };

    self.actions = {
      buzzer: {
        on: function(options) {
          var buzzer = sensors.buzzer.instance;
          var dur = Number(options && options.duration);
          buzzer.high();
          if (dur) {
            if (sensors.buzzer.timer) {
              clearTimeout(sensors.buzzer.timer);
            }
            sensors.buzzer.timer = setTimeout(function () {
              buzzer.low();
            }, dur);
          }
        },
        off: _.bind(sensors.buzzer.instance.low, sensors.buzzer.instance)
      },
      led: {
        on: function(options) {
          var led = sensors.led.instance;
          led.on();
          var dur = Number(options && options.duration);
          if (dur) {
            if (sensors.led.timer) {
              clearTimeout(sensors.led.timer);
            }
            sensors.led.timer = setTimeout(function () {
              led.off();
            }, dur);
          }
        },
        off: _.bind(sensors.led.instance.off, sensors.led.instance)
      },
      relay: {
        on: function(options) {
          var relay = sensors.relay.instance;
          relay.on();
          var dur = Number(options && options.duration);
          if (dur) {
            if (sensors.relay.timer) {
              clearTimeout(sensors.relay.timer);
            }
            sensors.relay.timer = setTimeout(function () {
              relay.off();
            }, dur);
          }
        },
        off: _.bind(sensors.relay.instance.off, sensors.relay.instance)
      }
    };

    // event
    _.each(['button', 'touch'],
      function (sname) {
        sensors[sname].instance.on('press', function() {
          logger.info('[event] press', sname, 1);
          self.emit('event', sname, 1);
        });
        sensors[sname].instance.on('release', function() {
          logger.info('[event] release', sname, 0);
          self.emit('event', sname, 0);
        });
      });

    // series
    _.each(['sound', 'light', 'rotary', 'temperature'], // 'vibration'
    //_.each(['soilMoisture', 'light', 'rotary', 'temperature'], // 'vibration'
      function (sname) {
        sensors[sname].instance.on('data', function(err, data) {
          if (sname === 'temperature') {
            sensors[sname].value = data.celsius.toFixed(2);
          } else if (sname === 'rotary') {
            var voltage = data * ADC / 1023;
            sensors[sname].value = Math.round(voltage * ROTARY_ANGLE_FULL_ANGLE / GROVE_VCC);
          } else{
            sensors[sname].value = data;
          	}
          sensors[sname].time = _.now();
        });
      });

    _.each(sensors, function(v) { v.status = 'on'; });
    board.on('error', function() {
      _.each(sensors, function(v) { v.status = 'off'; });
    });
    self.emit('ready');
  });
}
util.inherits(EdisonSensors, events.EventEmitter);

EdisonSensors.prototype.getData = function (name) {
  var self = this;
  logger.info('[getData]', name, self.sensors[name].status, self.sensors[name].value);
  return self.sensors[name];
};
EdisonSensors.prototype.doCommand = function (actuator, cmd, options) { 
  var self = this;
  if (self.actions[actuator] && self.actions[actuator][cmd]) {
    return self.actions[actuator][cmd](options);
  } else {
    logger.error('[EdisonSensors:doCommand] ', actuator, cmd, options);
  }
};

module.exports = new EdisonSensors();

process.on('uncaughtException', function (err) {
  logger.error('[EdisonSensors:uncaughtException] ' + err.stack);
});

if (require.main === module) { // run directly from node
  var edisonSensors = module.exports;

  edisonSensors.on('ready', function() {
    //get temperature
    var temp = edisonSensors.getData('temperature');
    logger.info('temperature', temp);
    //set event handler for sensor data notification
    edisonSensors.on('event', function (name, value) {
      logger.info(name, value);
    });
    //do actuator command
    edisonSensors.doCommand('led', 'on');
  });
}
