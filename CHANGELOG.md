# Changelog
All notable changes to this project should be documented in this file. The intention is to [keep a changelog](https://keepachangelog.com/en/1.0.0/) and follow [Semantic Versioning](https://semver.org/).


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