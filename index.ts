import {homedir} from 'os';
import {join} from 'path';
import {readFile, readdir, lstat, symlink, mkdir} from 'fs';
import {execFile} from 'child_process';
import * as async from 'async';
// micromatch has multiple patterns support; minimatch does not. However,
// micromatch.any('/etc/local/.npmrc', ['.npmrc'], {matchBase: true}) == false,
// which is wrong, so we'll go with inconvenient over wrong.
import * as minimatch from 'minimatch';

export const defaultNpmIgnorePatterns = [
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

export function log(message?: any, ...optionalParams: any[]) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(message, ...optionalParams);
  }
}

export function mkdir_p(path: string, callback: (error?: Error) => void) {
  // TODO: use fs.mkdir
  execFile('mkdir', ['-p', path], (error, stdout, stderr) => {
    if (error) return callback(error);
    callback();
  });
}

export function findNpmPrefix(callback: (error: Error, prefix?: string) => void) {
  execFile('npm', ['config', 'get', 'prefix'], (error, stdout, stderr) => {
    if (error) return callback(error);
    const prefix = stdout.trim();
    callback(null, prefix);
  });
}

export function findNpmIgnorePatterns(sourcePath: string,
                                      npmPrefix: string,
                                      callback: (error: Error, patterns?: string[]) => void) {
  readFile(join(sourcePath, '.npmignore'), {encoding: 'utf8'}, (error, data) => {
    const localLines = error ? [] : data.split(/\n/);
    readFile(join('etc', 'npmignore'), {encoding: 'utf8'}, (error, data) => {
      const globalLines = error ? [] : data.split(/\n/);
      const allLines = [...localLines, ...globalLines];
      const allPatterns = allLines.filter(pattern => !/^#/.test(pattern) && !/^\s*$/.test(pattern));
      callback(null, [...allPatterns, ...defaultNpmIgnorePatterns]);
    });
  });
}

export function readPackage(sourcePath: string,
                            callback: (error: Error, info?: {name: string}) => void) {
  readFile(join(sourcePath, 'package.json'), {encoding: 'utf8'}, (error, data) => {
    if (error) return callback(error);
    const info = JSON.parse(data);
    callback(null, info);
  });
}

export function link(sourcePath: string,
                     targetPath: string,
                     ignoreFunction: (file: string) => boolean,
                     callback: (error?: Error) => void) {
  lstat(sourcePath, (error, sourceStats) => {
    if (error) return callback(error);
    if (sourceStats.isDirectory()) {
      // if source is a directory, mkdir a new directory at targetPath and recurse
      mkdir_p(targetPath, error => {
        if (error) return callback(error);
        readdir(sourcePath, (error, files) => {
          if (error) return callback(error);
          const sourcePairs = files.map(file => [file, join(sourcePath, file)]);
          const includedSourcePairs = sourcePairs.filter(([_, source]) => !ignoreFunction(source));
          async.each(includedSourcePairs, ([file, source], callback) => {
            const target = join(targetPath, file);
            link(source, target, ignoreFunction, callback);
          }, callback);
        });
      });
    }
    else if (sourceStats.isSymbolicLink() || sourceStats.isFile()) {
      log(`${sourcePath} <- ${targetPath}`);
      // type declarations are incorrect; symlink should be overloaded with three arguments
      symlink(sourcePath, targetPath, null, callback);
    }
    else {
      callback(new Error(`Cannot link unusual source file: "${sourcePath}"`));
    }
  });
}


export function realLink(sourcePath: string,
                         callback: (error?: Error) => void) {
  findNpmPrefix((error, npmPrefix) => {
    if (error) return callback(error);

    const npmGlobalPath = join(npmPrefix, 'lib', 'node_modules');

    readPackage(sourcePath, (error, info) => {
      if (error) return callback(error);

      const targetPath = join(npmGlobalPath, info.name);
      log(`Using targetPath=${targetPath}`);

      findNpmIgnorePatterns(sourcePath, npmPrefix, (error, npmIgnorePatterns) => {
        if (error) return callback(error);

        const ignoreFunction = (path: string) => {
          return npmIgnorePatterns.some(pattern => minimatch(path, pattern, {matchBase: true}));
        };
        log(`Using npmIgnorePatterns=[${npmIgnorePatterns.join(', ')}]`);

        link(sourcePath, targetPath, ignoreFunction, callback);
      });
    });
  });
}
