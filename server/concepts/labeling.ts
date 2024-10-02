import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotFoundError } from "./errors";

export interface LabelDoc extends BaseDoc {
  tag: String;
  items: ObjectId[];
}

/**
 * concept: Labeling [Item]
 */
export default class LabelingConcept {
  public readonly labels: DocCollection<LabelDoc>;

  /**
   * Make an instance of Labeling.
   */
  constructor(collectionName: string) {
    this.labels = new DocCollection<LabelDoc>(collectionName);
  }

  /**
   * Update the labels with items they tag
   * @param item item in the app
   * @param tags labels for the item
   * @returns successful message
   */
  async addTags(item: ObjectId, tags: String[]) {
    for (const tag of tags) {
      let labeldoc = await this.labels.readOne({ tag });
      if (labeldoc === null) {
        await this.labels.createOne({ tag: tag, items: [item] });
      } else {
        await this.labels.partialUpdateOne({ tag }, { items: labeldoc.items.concat([item]) });
      }
    }
    return { msg: `Tags ${tags} successfully added!` };
  }

  /**
   * Get all items with given tag
   * @param tag a label
   * @returns all item ids with that label
   * @throws error if there are no items with a given tag
   */
  async getItemsWithTag(tag: String) {
    const labeldocs = await this.labels.readOne({ tag });
    if (labeldocs === null) {
      throw new NotFoundError(`No items have label ${tag}!`);
    }
    return labeldocs.items;
  }

  /**
   * Get all tags for an item
   *@param item an item
   *@returns all tags for the given item
   *@throws error if the item does not have any tags
   */
  async getTagsForItem(item: ObjectId) {
    const labeldocs = await this.labels.readMany({
      items: item,
    });
    if (labeldocs === null) {
      throw new NotFoundError(`Items ${item} has no labels!`);
    }
    return labeldocs.map((labeldoc: LabelDoc) => labeldoc.tag);
  }

  /**
   * Get all tags used so far
   * @returns all tags
   */
  async getAllTags() {
    const labeldocs = await this.labels.readMany({});
    return labeldocs.map((labeldoc: LabelDoc) => labeldoc.tag);
  }
}

export interface ControversialTopicDoc extends BaseDoc {
  topic: String;
  controversialRating: Number;
  tagsForTopic: { tag: String; spectrumRating: Number }[];
  opposingItems: { item: ObjectId; opposites: ObjectId[] };
}
