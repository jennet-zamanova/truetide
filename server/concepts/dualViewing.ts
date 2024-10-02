import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";

export interface ControversialTopicDoc extends BaseDoc {
  topic: String;
  controversialRating: Number;
  tagsForTopic: { tag: String; spectrumRating: Number }[];
  opposingItems: { item: ObjectId; opposites: ObjectId[] };
}

/**
 * concept: Labeling [Item]
 */
export default class DualViewingConcept {
  public readonly controversialTopics: DocCollection<ControversialTopicDoc>;

  /**
   * Make an instance of Labeling.
   */
  constructor(collectionName: string) {
    this.controversialTopics = new DocCollection<ControversialTopicDoc>(collectionName);
  }

  // `getNext(currentItem: Item, out nextItem: Item)` — Get related item with an opposing view to the `currentItem`
  // `system addOpposite(item: Item, opposingItem: set Item)` — Updates the opposingItem state
  // `system getOppositeTag(tag: String, out oppositeTags: set String)` — Finds the opposite tags or perspectives for the tag.
  // `system addTag(tag: String, out [controversialRating: Number, topic: String])` — add the tag to topics and assign rating to both (NLP) (if exists already just return rating)

  async getNext(item: ObjectId): Promise<ObjectId> {
    // TODO: Get related item with an opposing view to the `currentItem`
    return new ObjectId();
  }

  async addOpposite(item: ObjectId, opposingItem: ObjectId[]) {
    // TODO: Updates the opposingItem state
  }

  async getOppositeTag(tag: String): Promise<String> {
    // TODO: Finds the most opposite tag or perspective for the tag.
    return "";
  }

  async addTag(tag: String) {
    // TODO: add the tag to topics and assign rating to both (NLP) (if exists already just return rating)
  }

  async getOpposingItems(topic: String): Promise<ObjectId[]> {
    // TODO: get opposing items on the topic
    return [];
  }

  async getRating(topic: String): Promise<Number> {
    // TODO get the controversial rating of topic
    return 0;
  }

  async getTagsForTopic(topic: String): Promise<String[]> {
    // TODO get tags that would fall under the topic
    return [];
  }
}
