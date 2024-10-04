import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotFoundError } from "./errors";

export interface LabelDoc extends BaseDoc {
  labels: String[];
  topic: String;
  items: ObjectId[];
}

// Need to rework again: realized something may not work at all!
/**WIP!!! */

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
   * Update the labels with items they label
   * @param item item in the app
   * @param labels labels for the item
   * @returns successful message
   */
  async addLabels(item: ObjectId, labels: String[]) {
    // find topic
    const topic = await this.findTopic(labels);
    // add the labels for the given topic
    let labeldoc = await this.labels.readOne({ topic });
    if (labeldoc === null) {
      await this.labels.createOne({ topic: topic, labels: labels, items: [item] });
    } else {
      await this.labels.partialUpdateOne({ topic }, { items: labeldoc.items.concat([item]), labels: labeldoc.labels.concat(labels) });
    }
    return { msg: `Labels ${labels} successfully added!` };
  }

  /**
   * Find general field the labels belong to
   * @param labels some words that can be part of a common topic
   * @returns topic that these labels belong to
   */
  private async findTopic(labels: String[]): Promise<string> {
    return "";
  }

  /**
   * Get all items from labelDocs
   * @param labelDocs an array with length at least 1
   * @returns set of items
   */
  getItemsFromLabelDocs(labelDocs: LabelDoc[]): ObjectId[] {
    const items = labelDocs.reduce((accumulator, curLabelDoc) => {
      return accumulator.concat(curLabelDoc.items);
    }, labelDocs[0].items);
    return items;
  }

  /**
   * Find all items that have keyValue for key
   * @param key Must be a key in LabelDoc
   * @param keyValue  the value for the key we are trying to find items for
   * @returns all items with LabelDoc[key] = keyValue
   * @throws error if there is no key with keyValue
   */
  async getItems(key: string, keyValue: String): Promise<ObjectId[]> {
    const labeldocs = await this.labels.readMany({ [key]: keyValue });
    if (labeldocs.length === 0) {
      throw new NotFoundError(`No items have ${key} ${keyValue}!`);
    }
    return this.getItemsFromLabelDocs(labeldocs);
  }

  /**
   * Get all items with given tag
   * @param tag a label
   * @returns all item ids with that label
   * @throws error if there are no items with a given tag
   */
  async getItemsWithLabel(label: String): Promise<ObjectId[]> {
    return await this.getItems("label", label);
  }

  /**
   * Get all items within a field
   * @param tag a topic
   * @returns all item ids within the topic
   * @throws error if there are no items in a given topic
   */
  async getItemsWithTopic(topic: String): Promise<ObjectId[]> {
    return await this.getItems("topic", topic);
  }

  // /**
  //  * Get all labels for an item
  //  *@param item an item
  //  *@returns all labels for the given item
  //  *@throws error if the item does not have any labels
  //  */
  // async getLabelsForItem(item: ObjectId): Promise<ObjectId[]> {
  //   const labeldocs = await this.labels.readMany({
  //     items: item,
  //   });
  //   if (labeldocs.length === 0) {
  //     throw new NotFoundError(`Items ${item} has no labels!`);
  //   }
  //   return labeldocs.map((labeldoc: LabelDoc) => labeldoc.labels);
  // }

  /**
   * Get all labels used so far
   * @returns all labels
   */
  async getAllLabels(): Promise<String[]> {
    const labeldocs = await this.labels.readMany({});
    return labeldocs.reduce((accumulator: String[], labeldoc: LabelDoc) => accumulator.concat(labeldoc.labels), []);
  }

  async getOpposite(item: ObjectId, topic: String): Promise<ObjectId> {
    // TODO: Get related item with an opposing view to the `currentItem`
    // get all labels in topic
    // find opposing pairs among labels belonging to same topic
    return new ObjectId();
  }

  //   async addOpposite(item: ObjectId, opposingItem: ObjectId[]) {
  //     // TODO: Updates the opposingItem state
  //   }

  async getOppositeTag(tag: String, topic: String): Promise<String> {
    // TODO: Finds the most opposite tag or perspective for the tag.
    return "";
  }

  //   async addTag(tag: String) {
  //     // TODO: add the tag to topics and assign rating to both (NLP) (if exists already just return rating)
  //   }

  async getOpposingItems(topic: String): Promise<ObjectId[]> {
    // TODO: get opposing items on the topic
    return [];
  }

  //   async getRating(topic: String): Promise<Number> {
  //     // TODO get the controversial rating of topic
  //     return 0;
  //   }

  async getTagsForTopic(topic: String): Promise<String[]> {
    // TODO get tags that would fall under the topic
    return [];
  }
}
