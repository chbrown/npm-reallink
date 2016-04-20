# npm-reallink

[`npm link`](https://docs.npmjs.com/cli/link) can be used to link a local Node.js project into another project just like a normal dependency. `npm link` sort of emulates running `cd my-lib && npm publish && cd ../my-app && npm install my-lib`. This is super useful when you're developing two projects in tandem, and usually does mostly the right thing,

The problem is that `npm publish` potentially prunes a lot of stuff that `npm link` does not. `npm link` simply provides a portal (symlink) to the full root of the development copy: a simple single wholesale `ln -s ...`, which ignores any local `.npmignore` and the global and [implied](https://docs.npmjs.com/misc/developers#keeping-files-out-of-your-package) npm ignores.

`npm-reallink` is a hack of a script that recursively symlinks the files from `my-lib` into your global `node_modules` directory, except for the files that would be ignored if you `npm publish`'ed `my-lib`. I use it for TypeScript development, because the TypeScript compiler will use `%.ts` files in normally-`npm link`'ed projects, even if a `%.js` and `%.d.ts` pair is present, which is liable to break if your consumer project does not specify the same TypeScript configuration (in `tsconfig.json`) as the library project.

`npm-reallink` only replaces the local → global `npm link` (without arguments) call. After calling `npm-reallink` from within your `my-lib/` project root, use plain `npm link my-lib` from the other project that depends on `my-lib`, as you would normally.


## License

Copyright 2016 Christopher Brown. [MIT Licensed](http://chbrown.github.io/licenses/MIT/#2016).
