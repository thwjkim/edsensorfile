#!/usr/bin/env node
/*
 * Copyright (c) 2015, Daliworks. All rights reserved.
 *
 * Reproduction and/or distribution in source and binary forms 
 * without the written consent of Daliworks, Inc. is prohibited.
 *
 */
'use strict';
var jsonrpc = require('jsonrpc-tcp'),
_ = require('lodash'),
os = require('os'),
log4js = require('log4js'),
exec = require('child_process').exec,
edisonSensors = require('./edisonSensors');

//log4js.configure(__dirname + '/logger_cfg.json', {
//  reloadSecs: 30,
//  cwd: './log'
//});

var logger = log4js.getLogger('Main');

/**
 * Configuration
 **/
var 
JSONRPC_PORT = 50800,     // JSON-RPC server port
STATUS_INTERVAL = 60000,  // status report interval; less than gateway one. 

setNotiTable = {}, // notification is enabled or not for each sensor
clientConnection,  // the connection(assuming only one) from client. 
device0Id = '0',   // device address, any string allowed for url

/* 
 * Devices and its sensors info to be used for discovery response.
 *
 * Note: Sensor id can be any url unreserved characters on condition 
 *       that it is uniq across your devices under the gateway.
 */
DEVICES = [{
  deviceAddress: device0Id,
  sensors: [
    // Analog
    
    { //series
      id: [device0Id, 'sound'].join('-'),
      type: 'noise',
      name: 'sound',
      notification: false
    },
    /*
    { //series
      id: [device0Id, 'soilMoisture'].join('-'),
      type: 'humidity',
      name: 'soilMoisture',
      notification: false
    },
    */
    { //series
      id: [device0Id, 'light'].join('-'),
      type: 'light',
      name: 'light',
      notification: false
    },
    { //series
      id: [device0Id, 'rotary'].join('-'),
      type: 'rotaryAngle',
      name: 'rotary',
      notification: false
    },
    { //series
      id: [device0Id, 'temp'].join('-'),
      type: 'temperature',
      name: 'temperature',
      notification: false
    },
//    {
//      id: [device0Id, 'vib'].join('-'),
//      type: 'vibration',
//      name: 'vibration',
//      notification: false
//    },

    // Digital
    { // actuator
      id: [device0Id, 'buzz'].join('-'),
      type: 'powerSwitch',
      name: 'buzzer',
      notification: false
    },
    { // actuator
      id: [device0Id, 'led'].join('-'),
      type: 'powerSwitch',
      name: 'led',
      notification: false
    },
    { // actuator
      id: [device0Id, 'relay'].join('-'),
      type: 'powerSwitch',
      name: 'relay',
      notification: false
    },
    { //event
      id: [device0Id, 'button'].join('-'),
      type: 'onoff',
      name: 'button',
      notification: true
    },
    { //event
      id: [device0Id, 'touch'].join('-'),
      type: 'onoff',
      name: 'touch',
      notification: true
    }
  ]
}];

// util function: find target sensor from DEVICES
function getSensorInfo(cond) {
  var found;
  _.each(DEVICES, function(device) {
    var sensor = _.find(device.sensors, cond);
    found = sensor;
    return false;
  });
  return found || {};
}

/**
 * JSON-RPC server setup 
 *
 */
//JSON-RPC service functions: get/set/setNotification
var Sensor = {
  set: function (id, cmd, options, result) { 
    logger.info('[set actuator] id=%s cmd=%s options=%j', id, cmd, options);
    var target = getSensorInfo({id: id});
    edisonSensors.doCommand(target.name, cmd, options);
    result(null, 'success');
  },

  setNotification: function (id, result) { 
    if (!setNotiTable[id]) {
      setNotiTable[id] = true;
    }
    result(null, 'success');
  },

  get: function (id, result) { 
    var target = getSensorInfo({id: id}),
    sensorData = edisonSensors.getData(target.name);
    return result(null, {value: sensorData && sensorData.value, status: (sensorData && sensorData.status) || 'err'});
  }
};
// create JSON-RPC server
var server = jsonrpc.createServer(function (client/*, remote*/) {
  clientConnection = client;
  logger.warn('New client connection');
});
// Handling client connection error
server.on('clientError', function(err, conn) {
  logger.error('Connection closed');
  if (clientConnection === conn) {
    clientConnection = null;
    _.each(setNotiTable, function (v, k) {
      setNotiTable[k] = false;
    });
  }
});
// Exposing JSON-RPC services
server.expose('discover', function discover(result) { 
  logger.info('discovering', JSON.stringify(DEVICES));
  return result(null, DEVICES);
});
server.expose('sensor', Sensor);
// Start listening JSON-RPC server
server.listen(JSONRPC_PORT, function () {
  logger.info('listening port=%d', JSONRPC_PORT);
});


/*
 * Edison board setup
 */
// On Edison board ready, handles sensors data and status from board event.
edisonSensors.on('ready', function() {
  //set listener for sensor data notification from the board
  edisonSensors.on('event', function(name, value) {
    var target = getSensorInfo({name: name});
    if (!clientConnection || !(setNotiTable[target.id])) { 
      return; //skip if no client or no notification set.
    }
    clientConnection.send({method: 'sensor.notification',
      params: [target.id, {value: value}] });
  });

  //notify sensor status periodically.
  setInterval(function() {
    _.each(DEVICES, function(device) {
      _.each(device.sensors, function (target) {
        if (!clientConnection || !(setNotiTable[target.id])) { 
          return; //skip if no client or no notification set.
        }
        var sensorData = edisonSensors.getData(target.name);
        //notify sensor status
        clientConnection.send({method: 'sensor.notification',
          params: [target.id, {status: sensorData.status}] });
      });
    });
  }, STATUS_INTERVAL);
});
