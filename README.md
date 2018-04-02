# Golem

Golem is a webextension that's supposed to automate tasks in Ex Libris' Web-based ILS Alma.
It carries out menial tasks and is driven by words.

# Schem
[ʃɛm], from Hebrew שם‎ (Šēm).

When it grows up, Schem is going to be a clojure-y lisp dialect that's going to tell the golem how to behave.


------------
------------
# Development Setup

Run yarn to download and install all dependencies. (Feel free to use npm instead of yarn, if that works for you.)

	$ yarn    

If necessary, globally install the command line utility for Gulp.

    $ npm i -g gulp-cli 

If you're using vscode, you might want to add the following to your settings.json, to stop tslint from nagging about "problems" in node modules:

    "tslint.exclude": "**/node_modules/**/*.ts"


## During active developent

Start automatic compilation and live reload, whenever files are saved

    $ gulp --watch
    
Load the `dist/chrome`-directory as an unpacked extension into chrome.

## Entryfiles (bundles)

There are two kinds of entryfiles that create bundles.

1. All ts-files in the root of the `./app/scripts` directory
2. All css-,scss- and less-files in the root of the `./app/styles` directory

## Tasks

### Build

    $ gulp


| Option         | Description                                                                                                                                           |
|----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| `--watch`      | Starts a livereload server and watches all assets. <br>To reload the extension on change include `livereload.js` in your bundle.                      |
| `--production` | Minifies all assets                                                                                                                                   |
| `--verbose`    | Log additional data to the console.                                                                                                                   |
| `--vendor`     | Compile the extension for different vendors (chrome, firefox, opera, edge)  Default: chrome                                                                 |
| `--sourcemaps` | Force the creation of sourcemaps. Default: !production                                                                                                |

### Test

    $ gulp test

Runs the karma testrunner on a headless chrome (chromium) with tests using mocha/chai.
Files are located in the `test/` folder, conventions is `<dir>/<file-to-test>.spec.ts`.

### Packing the extension for firefox

    $ gulp pack --vendor=firefox

### Version

Increments version number of `manifest.json` and `package.json`,
commits the change to git and adds a git tag.


    $ gulp patch      // => 0.0.X

or

    $ gulp feature    // => 0.X.0

or

    $ gulp release    // => X.0.0


## Globals

The build tool also defines a variable named `process.env.NODE_ENV` in your scripts. It will be set to `development` unless you use the `--production` option.


**Example:** `./app/background.ts`

```typescript
if(process.env.NODE_ENV === 'development'){
  console.log('We are in development mode!');
}
```






