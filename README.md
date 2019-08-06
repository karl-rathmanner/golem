# Golem

A golem carries out menial tasks and is driven by words. I like antropomophizing stuff and thought the name was fitting, considering the project's original scope: making a *scriptable thing* with which you could automate a bunch of tasks in a browser based library system.

This turned into a webextension that's supposed to enable you to automate all kinds of things, change or extend any webpage's presentation of functionality. In essence, it's a userscript manager; but with lisp instead of javascript.

## Schem
[ʃɛm], from Hebrew שם‎ (Šēm). In many Disc- and Roundworld narratives, a golem's task and function are defined by a shem. "Schem" is the german spelling which lends itself to more puns. 

Schem is golem's scripting language. It's a lisp dialect that tries to replicate some of the many neat features clojure has.

While still pretty basic, Schem is already powerful enough to do cool stuff with. If you already know another lisp, you might feel at home in the editor. If not, you'll be helplessly lost as there's no documentation yet. In any case, the concept of foreign execution contexts might be something entirely new, probably. If you still want to play with this, having a look at example.schem or schem.spec.ts might get you somewhere.

Great performance or sane memory management are currently non-goals. In particular, switching to immutable data structures is something that I'm putting off for *later*.

## Security concerns

Yes.
____________________________________________________________________________________
____________________________________________________________________________________

# Development Setup

Install [node.js](https://nodejs.org/en/) (and optionally [yarn](https://yarnpkg.com/en/docs/install) for installing dependencies).

Download and install all of golem's dependencies:

	$ npm install

If you didnn't have gulp installed already, you might need to install its command line utility:

    $ npm i -g gulp-cli

Run `gulp --watch`, load `./dist/chrome` as an unpacked extension into chrome, et voilà~


Run `gulp --watch --vendor=YourBrowserNameHere`, if you want to build golem for other browsers, which worked the last time I checked, which was some time ago, which is to say: good luck!


### Editing Schem programs in your IDE

Files matching `/app/scripts/schemScripts/*.schem` can be edited in your IDE and will be instantly available at runtime if `gulp --watch` is active. Use slurp to load local file contents and return them as a tring. e.g.:

```clojure
(slurp "/myScript.schem")
```

If you can't live without parinfer, that's the way to go. But the in-browser editor is actually turning out quite nice, so check that out first.

### Testing

Tests can be left running in parallel to `gulp --watch` if you open multiple terminals. By default, karma is configured to use chrome, but different browsers can be defined in `karma.conf.js`. You might have to install additional [browser launchers](http://karma-runner.github.io/2.0/config/browsers.html). 

     $ gulp test


____________________________________________________________________________________
____________________________________________________________________________________

## Conventions

### Commit messages

Please adhere to [Jeremy Mack's](https://seesparkbox.com/foundry/semantic_commit_messages) / [Karma's style](http://karma-runner.github.io/2.0/dev/git-commit-msg.html) of commit messages, at least when it comes to subject lines. Message bodies and footers are separated by a newline, both are optional. I switched during development, so older commits will look different. ¯\\\_(ツ)_/¯

Example:
```
docs: change commit msg style on a whim

I should have just picked a style and stuck with it, but this one looks
so neat! Btw, I'm already writing a diary entry instead of a proper
message body, but at least the lines aren't longer than 72 characters.
```

Anatomy of a subject line:
```
feat(schem): add lambada function
├──┘├─────┘ ├────────────────────┘
│   │       └> Summary, lower case, in present tense
│   │
│   └> Scope, optional: golem, schem, ...
│
└> Type: feat, fix, demo, docs, refactor, cosmetic, style, test or toolchain.
```

Allowed types:
* feat: Adds a new feature.
* fix: Fixes an issue.
* change: Doesn't add anything new but changes existing behaviour.
* demo: Adds or changes examples for demoing features.
* docs: Changes documentation or changes comments substantially.
* refactor: Refactors production code, does not change behaviour.
* cosmetic: Changes nothing of consequence but makes you feel better. Like grammaticular corrigations or whitespace changes. 
* style: Fixes formatting. (Like cosmetic, but more passive aggressive.)
* test: Adds or changes tests.
* toolchain: Changes configs/tasks, adds dependencies and so on.


## Entryfiles (bundles)

There are two kinds of entryfiles that create bundles.

1. All ts-files in the root of the `./app/scripts` directory
2. All css-, scss- and less-files in the root of the `./app/styles` directory

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

You can safely ignore the message `Failed to load external module @babel/register`.

### Test

    $ gulp test

Runs the karma testrunner on a headless chrome (chromium) with tests using mocha/chai.
Files are located in the `test/` folder, conventions is `<dir>/<file-to-test>.spec.ts`.

### Building and packing for the Chrome Web Store

    $ gulp pack --production

### Packing the extension for firefox

    $ gulp pack --production --vendor=firefox

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