import { ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError, NotFoundError } from "./errors";
import { deleteFromGemini, getFileManager, getModelForVideoToText, uploadToGemini } from "./utils";

export interface PostOptions {
  backgroundColor?: string;
}

export interface PostDoc extends BaseDoc {
  author: ObjectId;
  content: string;
  options?: PostOptions;
}

/**
 * concept: Posting [Author]
 */
export default class PostingConcept {
  public readonly posts: DocCollection<PostDoc>;

  /**
   * Make an instance of Posting.
   */
  constructor(collectionName: string) {
    this.posts = new DocCollection<PostDoc>(collectionName);
  }

  async create(author: ObjectId, content: string, options?: PostOptions) {
    const _id = await this.posts.createOne({ author, content, options });
    return { msg: "Post successfully created!", post: await this.posts.readOne({ _id }) };
  }

  async getPosts() {
    // Returns all posts! You might want to page for better client performance
    return await this.posts.readMany({}, { sort: { _id: -1 } });
  }

  async getPost(_id: ObjectId) {
    // Returns specific post!
    return await this.posts.readOne({ _id });
  }

  async getPostsSubset(ids: ObjectId[]): Promise<PostDoc[]> {
    const optionalContentPosts = await Promise.all(
      ids.map(async (content: ObjectId) => {
        return await this.getPost(content);
      }),
    );
    const contentPosts = optionalContentPosts.filter((contentPost) => contentPost !== null);
    return contentPosts;
  }

  async getByAuthor(author: ObjectId) {
    return await this.posts.readMany({ author });
  }

  async update(_id: ObjectId, content?: string, options?: PostOptions) {
    await this.posts.partialUpdateOne({ _id }, { content, options });
    return { msg: "Post successfully updated!" };
  }

  async delete(_id: ObjectId) {
    const video_id = (await this.posts.readOne({ _id }))?.content;
    await this.posts.deleteOne({ _id });
    return { msg: "Post deleted successfully!" };
  }

  /**
   * Extracts text out of video content posted previously
   * @param _id video content id
   * @returns the text that was spoken in the content
   */
  async getContentText(_id: ObjectId) {
    const contentURL = await this.posts.readOne({ _id });
    if (contentURL === null) {
      throw new NotFoundError(`Post ${_id} does not exist!`);
    }
    const text = this.getFileText(contentURL.content);
    return text;
  }

  // TODO: DONT FORGET TO CHANGE
  /**
   * Extracts text out of video url
   * @param file some video file
   * @returns text spoken in the file
   */
  async getFileText(filePath: string): Promise<string> {
    // TODO: learn how to deal with token limits
    const model = getModelForVideoToText();
    const fileManager = getFileManager();
    const file = await uploadToGemini(fileManager, filePath);
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: file.mimeType,
          fileUri: file.uri,
        },
      },
    ]);
    await deleteFromGemini(fileManager, file);
    return result.response.text();
  }
  /**
   * Extracts text out of video file
   * @param file some video file
   * @returns text spoken in the file
   */
  async getFileTextLocally(filePath: string): Promise<string> {
    // TODO: learn how to deal with token limits
    const model = getModelForVideoToText();
    const fileManager = getFileManager();
    const file = await uploadToGemini(fileManager, filePath);
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: file.mimeType,
          fileUri: file.uri,
        },
      },
    ]);
    await deleteFromGemini(fileManager, file);
    return result.response.text();
  }

  async assertAuthorIsUser(_id: ObjectId, user: ObjectId) {
    const post = await this.posts.readOne({ _id });
    if (!post) {
      throw new NotFoundError(`Post ${_id} does not exist!`);
    }
    if (post.author.toString() !== user.toString()) {
      throw new PostAuthorNotMatchError(user, _id);
    }
  }
}

export class PostAuthorNotMatchError extends NotAllowedError {
  constructor(
    public readonly author: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} is not the author of post {1}!", author, _id);
  }
}
