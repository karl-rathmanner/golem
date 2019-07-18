## 0.11.0
Schem improvements:
- Finally removed SchemBoolean, SchemNumber and SchemString types. The interpreter uses the respective native types now, which is a lot cleaner.
- Added 'try', 'catch' and 'throw' forms.
- Added a bunch of other functions.

Shlukerts:
- Added one way data binding. If you use atoms within shlukerts vectors the corresponding dom elements will be automatically updated whenever the atoms' values change. No examples, yet. Sorry.
- Added functions for converting structures the other way. (e.g. dom tree to shlukerts vector)
- Added xml/html parsing functions.
- Added the id/class shorthand syntax that hiccup uses.

Editor improvements:
- Upgraded to monaco 0.17.0
- Added support for css, xml, html and plain text buffers.
- Added proper parinfer rule relaxation near the cursor.
- Autocompletion is now aware of where tokens start and end. 
- Parinfer can be enabled and disabled through the F2 menu.
- Some syntax highlighting tweaks.

## 0.10.0
Some quality of life improvements:
- Documentation for special forms and hard-wired symbols. (Press [ctrl+space] when the intellisense popup is open.)
- Added custom syntax highlighting and theme for monaco.
- Fixed docstrings and parameter info not showing up for macros.
- Made 'load-file' and 'slurp' handle paths more sensibly.

## 0.9.0
- Improved Parinfer integration by at least three units of satisfaction.
- Added hooks for custom shortcuts and tab reloads.
- Added and fixed a bunch of core functions.
- Added webRequest permission.
- The context manager can now detect existing contexts when it is initialized. ContextInstances are no longer persisted in local storage.
- Upgraded dependencies.

## 0.8.0
Adds editor support for different filetypes/languages; Parinfer can be disabled via the F1-menu.
(Currently: *.schem & *.json, everything else is treated as plain text.)

## 0.7.1-4
That mechanism I talked about in the 0.7.0 randomly stopped working when you weren't looking. It seems to do its job  reliably now. Mostly.

## 0.7.0
Golem finally has a mechanism that makes "permanent" changes to websites possible. :)

Notable features:
- Added a '.golemrc'-file that is executed on browser startup. (Not part of the virtual file system; can be accessed through the options page.)
- Autoinstantiation of contexts. (see example)
- Popup: More links and some indicator of whether there's an active context in the current tab.
- Opening the editor won't automatically load the "examples" script.
- The background page shows some status information about active contexts and such.
- Docstrings show up during auto-completion.
- Bundled d3 with this release, just for fun.
- Better js interop (plus examples).

## 0.6.0
Dear Diary,

I haven't released a new version in three months. I hope I can remember the most important changes but secretly I know, no one would notice if I didn't.

New Language features:
- Argument destructuring
  You could build your own dashboards now, if you knew how!
- Improved javascript interoperability (see examples)
- Completed the trinity of filter, map and reduce – they also use concurrency

New editor features:  
- Basic Parinfer integration in the editor
- Live javascript autocompletion with type and value previews
- Better saving & opening

Bonus feature: Undocumented support for "custom" background pages / dashboards.

## 0.5.0
Hello, user! Look at your address bar, now look at this changelog, now back at your address bar. Sadly, it can't interpret s-expressions. What if you entered "( "? Look again, your adress bar is now a REPL.

Typing [open parenthesis] followed by [tab] or [space] allows you to evaluate any kind of Schem expression in the background page's context from pretty much anywhere. The omnibox REPL has some support for autocompletion, a command history and will auto-close any missing parens. This definitely may be useful at some point but more importantly: it exists right now.

Other new features:
- Basic support for sequential destructuring / vector binding destructuring in let forms.
- A draft for "Shlukerts", a module for generating DOM elements using a [hiccup](https://github.com/weavejester/hiccup) like syntax.
- Atoms now support watches. (Think "onChange" functions.)
- Loading editor scripts from the virtual file system via the hash parameter:  
"[...]/pages/editor.html#yourFolder/yourFileName"
- A new "javascript reference" type that is useful for js interop and might be removed entirely if I find a better way to do what it does.
- Some more interop stuff!
- An HTML-Version of this changelog is now automatically bundled with builds.
- Improved examples.

Fixed vulnerabilities:  
Npm audit told me to upgrade my dependencies. Most notably, golem now uses gulp 4.

## 0.4.0
Improved Schem language support in the editor: autocompletion now shows all defined symbols in the editor's environment (both 'regular' and 'context' ones) and it is aware of the values they are bound to. Also added some xhr functions and one that turns xml documents into maps.

## 0.3.0
Added "persistent" contexts, that can be automatically set up/restored whenever a page loads.

## 0.2.2
Switched type tagged types to fix runtime type checking.

## 0.2.1 - 2018-08-25
### Actual public release
Added a few more 'last minute' features, fixes and better examples.

## 0.2.0 - 2018-08-17
### Public release
A lot happened between this version and the last. Things got built and broken down again. Everything is still in flux and keeping a changelog didn't make it to the list of my top priorities. But with golem's public release in light of its upcoming presentation at [IGeLU 2018](http://igelu2018.cz/) I thought it would be appropriate to bump the version number, wade through my commit log, and try to summarize the most notable changes since 0.1.0.

#### Golem broadened its horizon
This extension's original purpose was to enable users to automate tasks in (or change the looks and behaviour of) the browser based client for Ex Libris' integrated library system Alma.
During development my desire to use Schem to *manipulate all the things* that my browser can display grew too strong to suppress, so I shifted the goal to building a general purpose userscript manager. (Which, in the end, should be capable enough to implement the original features I had in mind from within its user space.)

I didn't start over with a fresh repository and there are still some residual bits and pieces of the last golem that I want to incorporate into this new iteration. And there's cruft. Lots of cruft. You have been warned.

#### The interpreter got less basic.  
The things you'd expect of a lisp implementation are there: Quoting, proper macros, a bunch of convenient reader macros, a repl environment...
But then there's more: The evaluation of Schem scripts is now based on es6 promises. Each step can take as long as it wants to return a result, things might run in parallel etc. This fits javascript's nature quite nicely and thanks to async/await, the typescript code almost makes sense most of the time!  
I also introduced the idea of "first class execution contexts". I'm not sure if they really are a new thing, if that's a good name or if they will turn out to be a horrible idea. But right now I believe they are a neat and useful abstraction over the different contexts present in the browser (tabs, windows, background scripts...) and the messaging between them.  
Oh, and javascript interoperability! You get to access, set and call anything that isn't on the blacklist.  
So: no eval() et al., at all.

#### A very integrated development environment
Live editing of scripts is possible from within the extension thanks to the integrated [Monaco Editor](https://github.com/Microsoft/monaco-editor). Many features feel pretty good already. Code completion isn't quite complete, though.  
(Press alt+a to open the editor, alt+e to evaluate the form at your cursor position.)

#### About documentation
There is none. Sorry. Stuff is still changing too fast. But if you are interested enough to be looking for documentation, just contact me. I give free tours! You'd make my day.


## 0.1.0 - 2018-04-02

### Added
- A (very basic) interpreter for Schem, which is yet another Lisp dialect with a punny name.  
Credit goes to [Joel Martin's](https://github.com/kanaka) awesome [Make a Lisp](https://github.com/kanaka/mal/blob/master/process/guide.md) guide and [Masahiro Wakame's](https://github.com/vvakame) TypeScript implementation of Mal.
- A sufficiently green-on-black Schem REPL page.
- Unit testing support, tanks to [ghiermann](https://github.com/ghiermann).
- This file, in celebration of Golem's first baby step on the way to synthetic consciousness.  
ᕕ( ՞ ᗜ ՞ )ᕗ

## 0.0.x - 2018-03-xx
### What happened before
- Used [mazamachi's](https://github.com/mazamachi) Yeoman [generator for chrome extensions written in TypeScript](https://github.com/mazamachi/generator-chrome-extension-kickstart-typescript) to scaffold out this project.
- Some css/javascript injection tests, much hair pulling.
- Trying to get a grip on typescript, lisp, writing your own lisp in typescript, webextensions, gulp, all those es6 features that look cool, the node.js ecosystem, ~~npm~~ yarn... (ongoing)

# Changelog
All notable changes to this project should be documented in this file. The intention is to [keep a changelog](https://keepachangelog.com/en/1.0.0/) and follow [Semantic Versioning](https://semver.org/).