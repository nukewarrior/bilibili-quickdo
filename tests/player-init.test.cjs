const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../bilibili-quickdo.user.js'), 'utf8');

function run(ready) {
    class Element extends EventTarget {
        static ELEMENT_NODE = 1;
        nodeType = 1;
        className = '';
        isConnected = true;
        readyState = 3;
        paused = true;
        muted = false;
        play() { this.paused = false; }
        pause() { this.paused = true; }
    }
    const video = new Element();
    const input = new Element();
    const control = new Element();
    const area = new Element();
    const sender = new Element();
    const document = new Element();
    document.body = new Element();
    const nodes = new Map();
    document.querySelectorAll = selector => nodes.get(selector) || [];
    function mount(player = video) {
        nodes.set('#bilibili-player video', [player]);
        nodes.set('.bpx-player-control-wrap', [control]);
        nodes.set('.bpx-player-video-area', [area]);
        nodes.set('.bpx-player-sending-area', [sender]);
        nodes.set('input.bpx-player-dm-input', [input]);
    }
    if (ready) mount();
    const observers = [];
    const calls = { panel: 0, start: 0, hide: 0, resize: 0, input: 0 };
    let modules;
    const window = new Element();
    const context = {
        document, window, Node: Element, NodeList: Array, setTimeout, clearTimeout,
        GM_getValue: () => undefined,
        GM_setValue: () => {},
        console: { log() {}, error(message, error) { throw error; } },
        MutationObserver: class {
            constructor(callback) { observers.push(this); this.callback = callback; }
            observe() {}
        },
        testSetup(objects) {
            modules = objects;
            objects.UI.hideSenderBar = () => calls.hide++;
            objects.UI.bottomTitle = () => {};
            objects.AUTOMATON.moreDescribe = () => {};
            objects.AUTOMATON.playStartMode = () => calls.start++;
            objects.AUTOMATON.videoQuality = () => {};
            objects.AUTOMATON.adjustUI = () => calls.resize++;
            objects.CONTROLLER.hideDanmuInput = () => calls.input++;
            objects.SETTING_PANEL.newSettingPanel = function () {
                calls.panel++;
                this.settingPanel = [new Element()];
            };
            objects.SETTING_PANEL.addCheckboxSettingItem = () => {};
            objects.SETTING_PANEL.addInputSettingItem = () => {};
        },
    };
    const marker = '    new MutationObserver((mutations, observer) => {';
    assert.ok(source.includes(marker), 'bootstrap observer must exist');
    vm.runInNewContext(source.replace(marker,
        '    testSetup({H5_PLAYER, CONTROLLER, AUTOMATON, SETTING_PANEL, UI});\n' + marker), context);
    const mutate = (records = []) => observers[0].callback(records);
    return { video, input, nodes, document, window, modules, calls, mount, mutate, Element };
}

const page = run(true);
assert.equal(page.calls.panel, 1, 'an already-mounted player must initialize without header-v2');
assert.equal(page.calls.start, 1, 'already-loaded media must apply startup settings');
page.mutate();
page.mutate();
assert.equal(page.calls.panel, 1, 'DOM updates must not duplicate the settings panel');
assert.equal(page.calls.start, 1, 'DOM updates must not repeat startup settings');
const enter = new Event('keydown');
Object.defineProperty(enter, 'keyCode', { value: 13 });
page.input.dispatchEvent(enter);
assert.equal(page.calls.input, 1, 'danmaku input must have only one Enter handler');

const replacement = new page.Element();
page.mount(replacement);
page.mutate();
assert.equal(page.modules.H5_PLAYER.h5Player[0], replacement, 'replaced video must be rebound');
assert.equal(page.calls.panel, 1, 'video replacement must reuse the connected panel');
const before = page.calls.start;
replacement.dispatchEvent(new Event('loadeddata'));
assert.equal(page.calls.start, before + 1, 'new media must receive startup settings');
page.window.dispatchEvent(new Event('resize'));
assert.equal(page.calls.resize, 1, 'video replacement must not duplicate resize handlers');
const mute = new Event('keydown', { cancelable: true });
Object.defineProperty(mute, 'keyCode', { value: 77 });
page.document.dispatchEvent(mute);
assert.equal(replacement.muted, true, 'one shortcut must perform exactly one action on the new video');
page.nodes.set('input:focus, textarea:focus', [page.input]);
page.document.dispatchEvent(mute);
assert.equal(replacement.muted, true, 'shortcuts must not run while typing');
page.nodes.delete('input:focus, textarea:focus');
page.modules.SETTING_PANEL.settingPanel[0].isConnected = false;
page.mutate();
assert.equal(page.calls.panel, 2, 'a removed settings panel must be recreated');
assert.equal(page.calls.start, before + 1, 'panel recreation must not rebind the same video');

const target = new page.Element();
target.className = 'bpx-player-control-bottom-right';
page.mutate([{ target, addedNodes: [] }]);
page.mutate([{ target, addedNodes: [{ nodeType: 3 }] }]);

const delayed = run(false);
assert.equal(delayed.calls.panel, 0, 'wait until the player is mounted');
delayed.mount();
delayed.nodes.delete('.bpx-player-control-wrap');
delayed.mutate();
assert.equal(delayed.calls.panel, 0, 'wait until player controls are mounted');
delayed.video.readyState = 0;
delayed.mount();
delayed.mutate();
assert.equal(delayed.calls.panel, 1, 'initialize when the player becomes ready');
assert.equal(delayed.calls.start, 0, 'wait for media data before applying startup settings');
delayed.video.dispatchEvent(new Event('loadeddata'));
assert.equal(delayed.calls.start, 1);

console.log('player initialization checks passed');
