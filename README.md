# Golem

Golem is a webextension that's supposed to automate tasks in Ex Libris' Web-based ILS Alma.
It carries out menial tasks and is driven by words.

## Schem
[ʃɛm], from Hebrew שם‎ (Šēm).

When it grows up, Schem is going to be a clojure-ish lisp dialect that's going to tell the golem how to behave.



------------
# Development Setup

Install [node.js](https://nodejs.org/en/) and [yarn](https://yarnpkg.com/en/docs/install), check if you're on the correct branch.

Run yarn to download and install all of golem's dependencies. (Feel free to use npm instead of yarn, if that works for you.)

	$ yarn    

If you don't have gulp installed already, install its command line utility.

    $ npm i -g gulp-cli

Run `gulp --watch`. 

Refer to the [Tasks](#Tasks)-section, if you want to build golem for other browsers.

## During Developent

Start automatic compilation and live reload with:

    $ gulp --watch
    
You can safely ignore the warning about `@babel/register`. 

Load the `dist/chrome`-directory as an unpacked extension into chrome. Whenever files are saved, the extension is automatically reloaded and should reflect your changes. Though, if in doubt: manually reload the extension.

Run `gulp --watch --vendor=firefox` if you prefer Firefox.

### Editing Schem programs in your IDE

Files matching `/app/scripts/schemScripts/*.schem` can be edited in your IDE and will be instantly available at runtime if `gulp --watch` is active. Use slurp to load local file contents and return them as a SchemString. e.g.:

```clojure
(slurp "/myScript.schem")
```
If you're using Visual Studio Code, your user settings will be overruled by setings.json in this workspace.
If not, consider somehow associating *.schem-files with clojure, to get syntax highlighting. In any case, installing a parinfer or paredit plugin is highly recommended for editing Schem scripts.

### Testing

Tests can be left running in parallel to `gulp --watch` if you open multiple terminals. By default, karma is configured to use chrome, but different browsers can be defined in `karma.conf.js`. You might have to install additional [browser launchers](http://karma-runner.github.io/2.0/config/browsers.html). 

     $ gulp test

## Conventions

### Commit messages

Please adhere to [Jeremy Mack's](https://seesparkbox.com/foundry/semantic_commit_messages) / [Karma's style](http://karma-runner.github.io/2.0/dev/git-commit-msg.html) of commit messages, at least when it comes to subject lines. Message bodies and footers are separated by a newline, both are optional. I switched during development, so older commits will look different. ¯\\\_(ツ)_/¯

Example:
```
docs: change commit msg style on a whim

I should have just picked a style and stuck to it, but this one looks
so neat! Btw, I'm already writing a diary entry instead of a proper
message body, but at least the lines aren't longer than 72 characters.
```

Anatomy of a subject line:
```
feat(schem): add lambada function
├──┘├─────┘ ├────────────────────┘
│   │       └> Summary, lower case, in present tense
│   │
│   └> Scope: golem, schem
│
└> Type: chore, docs, feat, fix, refactor, style, or test.
```

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
| `--vendor`     | Compile the extension for different vendors (chrome, firefox, opera, edge)  Default: chrome                                                           |
| `--sourcemaps` | Force the creation of sourcemaps. Default: !production                                                                                                |
| `test`         | Starts the testrunner                                                                                                                                 |

You can safely ignore the message: `Failed to load external module @babel/register`.
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