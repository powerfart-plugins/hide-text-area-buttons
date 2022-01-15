const { Plugin } = require('powercord/entities');
const { inject, uninject } = require('powercord/injector');
const { ContextMenu } = require('powercord/components');
const { findInReactTree, findInTree, forceUpdateElement } = require('powercord/util');
const { React, getModule, getModuleByDisplayName } = require('powercord/webpack');

const { _ } = window;

/* eslint-disable brace-style, no-undefined, object-property-newline, no-use-before-define */
// noinspection JSUnresolvedVariable
module.exports = class HideTextAreaButtons extends Plugin {
  async startPlugin () {
    this.currentButtons = [];

    this.loadStylesheet('style.css');

    this.injectToOpenContextMenuLazy({
      SlateTextAreaContextMenu: this.injectToTextAreaCM.bind(this)
    });
    this.loaded(() => {
      this.injectToTextAreaContainer();
    });
  }

  pluginWillUnload () {
    uninject('hide-text-area-buttons-cm');
    uninject('hide-text-area-buttons-container');
    uninject('hide-text-area-buttons-lazy-menu');
  }

  loaded (done) {
    if (powercord.initialized) {
      done();
    } else {
      powercord.once('loaded', done);
    }
  }

  getElemKey (elem) {
    const found = findInTree(elem, (m) => m?.render?.displayName || m?.type?.displayName, { walkable: [ 'children', 'props', 'type' ] });
    const name = elem?.type?.name || found?.render?.displayName || found?.type?.displayName || elem?.props?.className;

    return _.kebabCase(name);
  }

  getItemFromElem (elem) {
    const key = this.getElemKey(elem);
    const classes = getModule([ 'styleFlexible' ], false);
    const hidden = this.settings.get('hidden', []);

    if (!key) {
      return {};
    }
    return {
      type: 'checkbox',
      defaultState: !hidden.includes(key),
      id: key,
      name: React.createElement('div', {
        className: 'hide-text-area-buttons-row',
        children: [
          React.createElement('div', {
            className: `hide-text-area-buttons-icon ${key}`,
            children: elem
          }),
          React.createElement('span', null, getName(key))
        ]
      }),
      onToggle: (v) => {
        forceUpdateElement(`.${classes.menu}.${classes.styleFlexible}`); // powerocrd bug, @todo: make PR

        if (v) {
          hidden.splice(hidden.indexOf(key), 1);
        } else {
          hidden.push(key);
        }
        this.settings.set('hidden', hidden);
      }
    };

    function getName (raw) {
      const startCase = _.startCase(raw).toLowerCase();
      const fixReplace = startCase
        .replace(/(\s)?button/, '')
        .replace(/channel(\s)?/, '');

      return _.upperFirst(fixReplace);
    }
  }

  injectToTextAreaCM () {
    const SlateTextAreaContextMenu = getModule((m) => m?.default?.displayName === 'SlateTextAreaContextMenu', false);
    const ChannelSendMessageButton = getModule((m) => m?.type?.render?.displayName === 'ChannelSendMessageButton', false).type;
    const submitButtonItem = this.getItemFromElem(ChannelSendMessageButton.render({ disabled: true }));
    // const { roleRow } = getModule([ 'roleRow', 'roleDot' ], false); // is a lazy load module...

    inject('hide-text-area-buttons-cm', SlateTextAreaContextMenu, 'default', (args, res) => {
      const menu = res.props.children;
      const submitButtonIndex = menu.findIndex(e => e?.props?.id === 'submit-button');
      const sbp = menu[submitButtonIndex].props;

      submitButtonItem.id = sbp.id;
      submitButtonItem.defaultState = sbp.checked;
      submitButtonItem.onToggle = sbp.action;
      findInReactTree(submitButtonItem.name, (m) => m?.type === 'span').props.children = sbp.label;

      const [ btn ] = ContextMenu.renderRawItems([ {
        type: 'submenu',
        name: 'Buttons',
        id: this.entityID,
        disable: !powercord.initialized,
        className: 'hide-text-area-buttons-menu',
        note: powercord.initialized ? undefined : 'sorry, PowerCord still load',
        items: [
          ...this.currentButtons
            .map(this.getItemFromElem.bind(this))
            .filter((e) => e.id !== 'channel-send-message-button'),
          submitButtonItem
        ],
        getItems () { return this.items; }
      } ]);

      menu[submitButtonIndex] = null;
      menu.splice(1, 0, btn);
      return res;
    });

    SlateTextAreaContextMenu.default.displayName = 'SlateTextAreaContextMenu';
  }

  injectToTextAreaContainer () {
    const ChannelTextAreaContainer = getModule((m) => m?.type?.render?.displayName === 'ChannelTextAreaContainer', false).type;
    const forEachHandler = (hidden, elem, index, tree) => {
      if (elem?.props?.children?.length > 1) {
        elem.props.children.forEach((...args) => forEachHandler(hidden, ...args));
      } else {
        this.currentButtons.push(elem);

        if (hidden.includes(this.getElemKey(elem))) {
          tree[index] = null;
        }
      }
    };

    inject('hide-text-area-buttons-container', ChannelTextAreaContainer, 'render', (args, res) => {
      const props = findInReactTree(res, ({ className }) => className?.includes('buttons-'));
      const hidden = this.settings.get('hidden', []);
      if (props) {
        this.currentButtons = [];
        props.children.forEach((...args) => forEachHandler(hidden, ...args));
      }
      return res;
    });

    ChannelTextAreaContainer.render.displayName = 'ChannelTextAreaContainer';
  }

  injectToOpenContextMenuLazy (menus) {
    inject('hide-text-area-buttons-lazy-menu', getModule([ 'openContextMenuLazy' ], false), 'openContextMenuLazy', ([ event, lazyRender, params ]) => {
      const warpLazyRender = async () => {
        const render = await lazyRender(event);

        return (config) => {
          const menu = render(config);
          const CMName = menu?.type?.displayName;

          if (CMName) {
            const moduleByDisplayName = getModuleByDisplayName(CMName, false);

            if (CMName in menus) {
              menus[CMName]();
              delete menus[CMName];
            }
            if (moduleByDisplayName !== null) {
              menu.type = moduleByDisplayName;
            }
          }
          return menu;
        };
      };

      return [ event, warpLazyRender, params ];
    }, true);
  }

  // async updateArea () {
  //   // const { channelTextArea: class1 } = getModule([ 'channelTextArea', 'buttonContainer' ], false);
  //   // const { channelTextArea: class2 } = getModule([ 'channelTextArea', 'channelName' ], false);
  //   // forceUpdate(`div.${class1}.${class2}`);
  // }
};
