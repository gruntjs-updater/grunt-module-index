/*
 * grunt-module-index
 *
 * Copyright (c) 2014-2015 Ignacio Lago
 * Licensed under the MIT license.
 */

'use strict';

var walk = require("walk");
var path = require("path");
var fs = require("fs");

// Repeats a string
function nTimes(str, n) {
  var ret = '';
  if (n > 0) {
    for (var _i = 1; _i <= n; ++_i) {
      ret += str;
    }
  }
  return ret;
}

// Prints our path-objects, coffee style
function printObjCoffee(obj, deep, _tab) {
  var ret = "",
    key;
  if (deep === null) {
    deep = 1;
  }
  if (_tab === null) {
    _tab = '  ';
  }
  for (key in obj) {
    if (!{}.hasOwnProperty.call(obj, key)) {
      continue;
    }
    if ('object' === typeof obj[key]) {
      ret += nTimes(_tab, deep) + key + ':' + "\n";
      ret += printObjCoffee(obj[key], deep + 1, _tab);
    }
    else {
      ret += nTimes(_tab, deep) + key + ': require "' + obj[key] + '"\n';
    }
  }
  return ret;
}

// Prints our path-objects, javascript style
function printObjJs(obj, deep, _tab) {
  var ret = [],
    key;
  if (deep === null) {
    deep = 1;
  }
  if (_tab === null) {
    _tab = '  ';
  }
  for (key in obj) {
    if (!{}.hasOwnProperty.call(obj, key)) {
      continue;
    }
    if ('object' === typeof obj[key]) {
      var str = nTimes(_tab, deep) + '"' + key + '": {' + "\n";
      str += printObjJs(obj[key], deep + 1, _tab);
      str += '\n' + nTimes(_tab, deep) + '}';
      ret.push(str);
    }
    else {
      ret.push(nTimes(_tab, deep) + '"' + key + '": require("' +
        obj[key] + '")');
    }
  }
  return ret.join(',\n');
}

function unixifyPath(filePath) {
  if (process.platform === 'win32') {
    return filePath.replace(/\\/g, '/');
  }
  else {
    return filePath;
  }
}

module.exports = function(grunt) {

  function moduleIndex(dirs, dest, options) {
    var exportable = {},
      ret = '',
      _dest_dir,
      fmt = options.format || 'js';

    //------- file entry
    function fileEntry(filePath) {
      var deep,
        levels,
        last,
        total,
        file,
        fileName,
        fileExt,
        fileRoot,
        _path;

      _path = filePath = path.normalize(filePath);
      file = path.basename(filePath);
      fileExt = path.extname(filePath);
      fileName = path.basename(filePath, fileExt);
      fileRoot = path.dirname(filePath);

      if (!options.requireWithExtension) {
        _path = fileRoot + path.sep + fileName;
      }

      _path = unixifyPath(_path);

      // directories array
      levels = fileRoot.split(path.sep);
      last = exportable;
      total = levels.length;
      for (var _i = 0; _i < total; ++_i) {
        deep = levels[_i];
        // ignore some dirs
        if (
          // not empty
          deep &&
          // not relative
          deep !== '.' && deep !== '..'
        ) {
          // ignore folder(s)
          if (options.flatIndex || options.omitDirs.indexOf(deep) >= 0) {
            if ((_i + 1) === total) {
              last[fileName] = options.pathPrefix + _path;
            }
          }
          // not omitted
          else if (options.omitDirs.indexOf(deep) === -1) {
            if (!last[deep]) {
              last[deep] = {};
            }
            // filename
            if ((_i + 1) === total) {
              last[deep][fileName] = options.pathPrefix + _path;
            }
            else {
              last = last[deep];
            }
          }
        }
      }
    }

    //------- Destination

    // normalize dest
    if (dest) {
      // it's just a dir
      if (grunt.file.isDir(dest)) {
        dest = path.join(dest, path.sep + 'index.' + fmt);
      }
      dest = path.normalize(dest);
    }
    else {
      dest = 'index.' + fmt;
    }
    _dest_dir = path.dirname(dest);

    // create dest folder
    if (!grunt.file.exists(_dest_dir)) {
      grunt.file.mkdir(_dest_dir);
    }

    //------- Options for walker
    var walkerOptions = {
      listeners: {
        // sorted output
        names: function(root, nodeNamesArray) {
          return nodeNamesArray.sort(function(a, b) {
            if (a > b) {
              return 1;
            }
            if (a < b) {
              return -1;
            }
            return 0;
          });
        },
        // ignore directories
        directories: function(root, dirStatsArray, next) {
          return next();
        },
        // main logic
        file: function(root, fileStats, next) {
          var _path;

          // ignore hidden
          if (fileStats.name[0] !== '.') {
            _path = root + path.sep + fileStats.name;
            _path = path.relative(_dest_dir, _path);
            fileEntry(_path);
          }
          return next();
        },
        errors: function(root, nodeStatsArray, next) {
          return next();
        }
      }
    };

    // walk!
    dirs.forEach(function(filePath) {
      if (!grunt.file.exists(filePath)) {
        console.error('File ' + filePath + ' missing!');
        return false;
      }
      // walk directories
      if (grunt.file.isDir(filePath)) {
        walk.walkSync(filePath, walkerOptions);
      }
      // individual files
      else {
        fileEntry(path.relative(_dest_dir, filePath));
      }
    });

    // create the content
    var notice = 'This file was auto-generated by grunt-module-index, ' +
      'DO NOT edit it directly';

    if (fmt === 'coffee') {
      ret = '#! ' + notice + '\n';
      if (options.notice) {
        ret += '#! ' + options.notice + '\n';
      }
      ret += 'module.exports = exports =\n';
      ret += printObjCoffee(exportable, null, options.indentTab);
      ret += '\n#EOF\n';
    }
    else {
      ret = '//! ' + notice + '\n';
      if (options.notice) {
        ret += '//! ' + options.notice + '\n';
      }
      ret += 'module.exports = exports = {\n';
      ret += printObjJs(exportable, null, options.indentTab);
      ret += '\n};\n//EOF\n';
    }

    // write the content
    try {
      fs.writeFileSync(dest, ret);
    }
    catch (e) {
      grunt.log.error();
      grunt.fail.warn('Unable to create "' + dest +
        '" file (' + e.message + ').', e);
    }
    return dest;
  }

  grunt.registerMultiTask(
    'moduleIndex',
    'Auto-build module index file.',
    function() {
      // merge default options
      var options = this.options({
        format: grunt.option('format') || 'js',
        requireWithExtension: grunt.option('requireWithExtension') === true,
        pathPrefix: grunt.option('pathPrefix') || '',
        omitDirs: grunt.option('omitDirs') || [],
        indentTab: grunt.option('indentTab') || '  ',
        flatIndex: grunt.option('flatIndex') || false
      });

      // omitDirs must be an array
      if ('string' === typeof options.omitDirs) {
        options.omitDirs = [options.omitDirs];
      }

      this.files.forEach(function(filePair) {
        var dest = moduleIndex(filePair.src, filePair.dest, options);
        grunt.log.ok('Module index "' + dest + '" created');
      });
    }
  );
};
