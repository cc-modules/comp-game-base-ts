import * as env from '../util-env/util-env';
import * as strings from '../util-strings/util-strings';
import Gif, { IGifProps } from '../comp-gif/comp-gif';

const { ccclass, property } = cc._decorator;

@ccclass
export default class GameBase extends cc.Component {
  [key: string]: any;

  /**
   * 是否开启碰撞系统
   *
   * @memberof GameBase
   */
  @property
  collisionSystem = false

  /**
   * 是否开启碰撞系统调试
   *
   * @memberof GameBase
   */
  @property
  debugCollision = false

  /**
   * 远程资源主机名，也可以是设备存储绝对地址
   *
   * @memberof GameBase
   */
  @property
  resourceHost = '';

  /**
   * 远程资源文件夹名，也可以是设备存储文件夹名
   *
   * @memberof GameBase
   */
  @property
  directory = '';

  _env: any;
  _query: Record<string, any> = {};

  onLoad() {
    this._env = env;
    this._query = strings.parseQuery(location.search);

    const collisionManager = cc.director.getCollisionManager()
    if (collisionManager) {
      collisionManager.enabled = this.collisionSystem;
      collisionManager.enabledDebugDraw = this.debugCollision;
    }
  }

  // logging related
  $debug(...args: any[]) { return env.debug(...args);}
  $log(...args: any[]) { return env.log(...args);}
  $warn(...args: any[]) { return env.warn(...args);}
  $error(...args: any[]) { return env.error(...args);}
  $group(...args: any[]) { return env.group(...args);}
  $groupCollapsed(...args: any[]) { return env.groupCollapsed(...args);}

  /**
   * 加载音频
   *
   * @param {string} filename 音频路径
   * @param {string} [key=''] 用于后续播放音频的名字
   * @returns
   * @memberof GameBase
   */
  loadAudio(filename: string, key: string = '') {
    this.checkHostAndDir();
    const promise = cc.loaderp.load(this.urlOf(filename));
    if (key) {
      promise.then((clip: cc.AudioClip) => {
        this[`_$audio${strings.capitalize(key)}`] = clip;
      });
    }
    return promise;
  }

  /**
   * 加载多个音频
   *
   * @param {(string[] | Record<string, string>)} filenames
   * @returns
   * @memberof GameBase
   * @example
   *  this.loadAudios(['red.mp3', 'green.mp3', 'blue.mp3']);
   *  this.playAudio('red.mp3');
   *
   *  this.loadAudios({
   *   red: 'red.mp3',
   *   green: 'green.mp3',
   *   blue: 'blue.mp3'
   *  });
   *  this.playAudio('red');
   */
  loadAudios (filenames: string[] | Record<string, string>) {
    this.checkHostAndDir();
    if (Array.isArray(filenames)) {
      return cc.loaderp.loadAll(filenames.map(it => [this.urlOf(it)]));
    } else {
      const keys = Object.keys(filenames);
      const values = keys.map(k => filenames[k]);
      const promise = this.loadAudios(values).then((clips: cc.AudioClip[]) => {
        clips.forEach((clip, i) => this[`_$audio${strings.capitalize(keys[i])}`] = clip);
      });
      return promise;
    }
  }

  /**
   * 播放音频
   *
   * @param {string} audioName 音频名字
   * @returns {number} 音频ID
   * @memberof GameBase
   */
  playAudio (audioName: string): number {
    const key = strings.capitalize(audioName);
    const url = this[`_$audio${strings.capitalize(key)}`];
    if (!url) return -1;
    // @ts-ignore
    return cc.audioEngine.play(url);
  }

  /**
   * 播放音频
   *
   * @param {string} audioName 音频名字
   * @param {boolean} [tryLoad=false] 如果不存在对应音频是否尝试从远程资源加载
   * @param {string} [key=audioName] 远程加载后保存为key指定的音频名
   * @returns {Promise<void>}
   * @memberof GameBase
   */
  playAudioPromise (audioName: string, tryLoad: boolean = false, key: string = audioName, ext: string = '.mp3'): Promise<void> {
    const id = this.playAudio(key);
    if (id < 0) {
      if (!tryLoad) {
        return Promise.reject(`${audioName} not found!`);
      } else {
        return this.loadAudio(`${audioName}${ext}`, key).then(() => {
          return this.playAudioPromise(audioName);
        });
      }
    } else {
      return new Promise(rs => {
        cc.audioEngine.setFinishCallback(id, rs);
      });
    }
  }

  /**
   * 加载图片并显示在给定节点上
   *
   * @param {string} path 图片路径
   * @param {cc.Node} node 指定节点
   * @returns {Promise<cc.Sprite>}
   * @memberof GameBase
   */
  loadImage (path: string, node: cc.Node, initProps: any): Promise<cc.Sprite> {
    return new Promise((rs, rj) => {
      cc.loaderp.load(this.urlOf(path)).then((tex: cc.Texture2D) => {
        const frame = new cc.SpriteFrame(tex);
        let sprite = node.getComponent(cc.Sprite);
        if (!sprite) {
          sprite = node.addComponent(cc.Sprite);
        }
        sprite.spriteFrame = frame;
        if (initProps) {
          for (let i in initProps) {
            node[i] = initProps[i];
          }
        }
        rs(sprite);
      }).catch(rj);
    });
  }

  /**
   * 加载序列帧到给定节点并播放
   *
   * @param {string} pathWithoutExt 序列帧文件名（无后缀）
   * @param {cc.Node} node 给定接地那
   * @param {number} [times] 播放次数
   * @returns {(Promise<void | Gif>)}
   * @memberof GameBase
   */
  loadGif (pathWithoutExt: string, node: cc.Node, gifProps: IGifProps | null): Promise<void | Gif> {
    return new Promise((rs, rj) => {
      cc.loaderp.loadAtlas(this.urlOf(pathWithoutExt)).then(atlas => {
        let gif = node.getComponent('Gif') as Gif;
        if (!gif) gif = node.addComponent('Gif');
        gif.atlas = atlas;
        if (gifProps) {
          for (let k in gifProps) gif[k] = gifProps[k];
          gif.init();
        }
        rs(gif);
      }).catch(rj);
    });
  }

  /**
   * 加载龙骨到给定节点并播放
   *
   * @param {cc.loaderp.IDragonBoneLoadOptions} opts 序列帧设置
   * @param {cc.Node} node 给定节点
   * @returns
   * @memberof GameBase
   */
  loadDragonBones(name: string, node: cc.Node, armature: string, animation: string, times: number = -1) {
    const opts: cc.loaderp.IDragonBoneLoadOptions = {
      skeUrl: this.urlOf(`${name}_ske.json`),
      texJsonUrl: this.urlOf(`${name}_tex.json`),
      texUrl: this.urlOf(`${name}_tex.png`),
      armatureName: armature,
      animationName: animation,
      times
    };
    return cc.loaderp.loadDragonBone(opts, node);
  }

  /**
   * 设置资源根路径，可以是URL，也可是手机绝对路径
   *
   * @param {string} host
   * @returns
   * @memberof GameBase
   */
  setResourceHost (host: string) {
    this.resourceHost = host;
    return this;
  }

  /**
   * 设置资源目录
   *
   * @param {string} dir
   * @returns
   * @memberof GameBase
   */
  setDirectory (dir: string) {
    this.directory = dir;
    return this;
  }

  /**
   * 返回filename对应的资源绝对路径
   *
   * @param {string} filename
   * @param {*} [dir=this.directory]
   * @returns
   * @memberof GameBase
   */
  urlOf(filename: string, dir = this.directory) {
    this.checkHostAndDir();
    return `${this.resourceHost}/${dir}/${filename}`;
  }

  private checkHostAndDir () {
    if (!this.resourceHost) {
      throw new Error('Please set resource host property of GameBase!');
    }
    if (!this.directory) {
      throw new Error('Please set directory first!');
    }
  }
}

