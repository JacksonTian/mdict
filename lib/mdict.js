import MDX from "./mdx.js";
import MDD from "./mdd.js";

/**
 * MDict 类的配置选项
 * @typedef {Object} MDictOptions
 * @property {string} mdx - MDX 字典文件的路径
 * @property {string} [mdd] - MDD 资源文件的路径（可选）
 */

export default class MDict {
    /**
     * 创建一个新的 MDict 实例
     * @param {MDictOptions} options - MDict 配置选项
     */
    constructor(options) {
        this.mdx = new MDX(options.mdx);
        this.mdd = options.mdd ? new MDD(options.mdd) : null;
    }

    async buildIndex() {
        await this.mdx.build();
        this.mdxIndex = await this.mdx.index();
        if (this.mdd) {
            await this.mdd.build();
            this.mddIndex = await this.mdd.index();
        }

        return {
            mdx: this.mdxIndex,
            mdd: this.mddIndex
        };
    }
}