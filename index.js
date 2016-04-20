"use strict";
var path_1 = require('path');
var fs_1 = require('fs');
var child_process_1 = require('child_process');
var async = require('async');
// micromatch has multiple patterns support; minimatch does not. However,
// micromatch.any('/etc/local/.npmrc', ['.npmrc'], {matchBase: true}) == false,
// which is wrong, so we'll go with inconvenient over wrong.
var minimatch = require('minimatch');
exports.defaultNpmIgnorePatterns = [
    '.*.swp',
    '._*',
    '.DS_Store',
    '.git',
    '.hg',
    '.npmrc',
    '.lock-wscript',
    '.svn',
    '.wafpickle-*',
    'config.gypi',
    'CVS',
    'npm-debug.log',
    // meta default:
    'node_modules',
];
function log(message) {
    var optionalParams = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        optionalParams[_i - 1] = arguments[_i];
    }
    if (process.env.NODE_ENV !== 'production') {
        console.error.apply(console, [message].concat(optionalParams));
    }
}
exports.log = log;
function mkdir_p(path, callback) {
    // TODO: use fs.mkdir
    child_process_1.execFile('mkdir', ['-p', path], function (error, stdout, stderr) {
        if (error)
            return callback(error);
        callback();
    });
}
exports.mkdir_p = mkdir_p;
function findNpmPrefix(callback) {
    child_process_1.execFile('npm', ['config', 'get', 'prefix'], function (error, stdout, stderr) {
        if (error)
            return callback(error);
        var prefix = stdout.trim();
        callback(null, prefix);
    });
}
exports.findNpmPrefix = findNpmPrefix;
function findNpmIgnorePatterns(sourcePath, npmPrefix, callback) {
    fs_1.readFile(path_1.join(sourcePath, '.npmignore'), { encoding: 'utf8' }, function (error, data) {
        var localLines = error ? [] : data.split(/\n/);
        fs_1.readFile(path_1.join('etc', 'npmignore'), { encoding: 'utf8' }, function (error, data) {
            var globalLines = error ? [] : data.split(/\n/);
            var allLines = localLines.concat(globalLines);
            var allPatterns = allLines.filter(function (pattern) { return !/^#/.test(pattern) && !/^\s*$/.test(pattern); });
            callback(null, allPatterns.concat(exports.defaultNpmIgnorePatterns));
        });
    });
}
exports.findNpmIgnorePatterns = findNpmIgnorePatterns;
function readPackage(sourcePath, callback) {
    fs_1.readFile(path_1.join(sourcePath, 'package.json'), { encoding: 'utf8' }, function (error, data) {
        if (error)
            return callback(error);
        var info = JSON.parse(data);
        callback(null, info);
    });
}
exports.readPackage = readPackage;
function link(sourcePath, targetPath, ignoreFunction, callback) {
    fs_1.lstat(sourcePath, function (error, sourceStats) {
        if (error)
            return callback(error);
        if (sourceStats.isDirectory()) {
            // if source is a directory, mkdir a new directory at targetPath and recurse
            mkdir_p(targetPath, function (error) {
                if (error)
                    return callback(error);
                fs_1.readdir(sourcePath, function (error, files) {
                    if (error)
                        return callback(error);
                    var sourcePairs = files.map(function (file) { return [file, path_1.join(sourcePath, file)]; });
                    var includedSourcePairs = sourcePairs.filter(function (_a) {
                        var _ = _a[0], source = _a[1];
                        return !ignoreFunction(source);
                    });
                    async.each(includedSourcePairs, function (_a, callback) {
                        var file = _a[0], source = _a[1];
                        var target = path_1.join(targetPath, file);
                        link(source, target, ignoreFunction, callback);
                    }, callback);
                });
            });
        }
        else if (sourceStats.isSymbolicLink() || sourceStats.isFile()) {
            log(sourcePath + " <- " + targetPath);
            // type declarations are incorrect; symlink should be overloaded with three arguments
            fs_1.symlink(sourcePath, targetPath, null, callback);
        }
        else {
            callback(new Error("Cannot link unusual source file: \"" + sourcePath + "\""));
        }
    });
}
exports.link = link;
function realLink(sourcePath, callback) {
    findNpmPrefix(function (error, npmPrefix) {
        if (error)
            return callback(error);
        var npmGlobalPath = path_1.join(npmPrefix, 'lib', 'node_modules');
        readPackage(sourcePath, function (error, info) {
            if (error)
                return callback(error);
            var targetPath = path_1.join(npmGlobalPath, info.name);
            log("Using targetPath=" + targetPath);
            findNpmIgnorePatterns(sourcePath, npmPrefix, function (error, npmIgnorePatterns) {
                if (error)
                    return callback(error);
                var ignoreFunction = function (path) {
                    return npmIgnorePatterns.some(function (pattern) { return minimatch(path, pattern, { matchBase: true }); });
                };
                log("Using npmIgnorePatterns=[" + npmIgnorePatterns.join(', ') + "]");
                link(sourcePath, targetPath, ignoreFunction, callback);
            });
        });
    });
}
exports.realLink = realLink;
