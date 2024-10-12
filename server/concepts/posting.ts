import { ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError, NotFoundError } from "./errors";
import { deleteFromGemini, getFileManager, getModelForVideoToText, uploadToGemini } from "./utils";

export interface PostOptions {
  backgroundColor?: string;
}

export interface PostDoc extends BaseDoc {
  author: ObjectId;
  content: ObjectId;
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

  async create(author: ObjectId, filePath: string, options?: PostOptions) {
    const content = await this.posts.uploadVideo(filePath);
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

  async idsToVideos(ids: ObjectId[]) {
    const posts = await this.posts.readMany({ _id: { $in: ids } });
    // NOT SURE HOW TO DO WO DOWNLOADING THE VIDEO -> adding a screenshot feels like a lot of work for poc
    // Store strings in Map because ObjectId comparison by reference is wrong
    const videoIds: [string, string][] = await Promise.all(
      posts.map(async (post) => {
        const videoPath = post.content + "download.mp4";
        await this.posts.downloadVideo(post.content, videoPath);
        return [post._id.toString(), videoPath];
      }),
    );
    const idToVideo = new Map(videoIds);
    return ids.map((id) => idToVideo.get(id.toString()) ?? "DELETED_POST");
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
    if (content !== undefined) {
      const content_id = await this.posts.uploadVideo(content);
      await this.posts.partialUpdateOne({ _id }, { content: content_id, options });
    } else {
      await this.posts.partialUpdateOne({ _id }, { options });
    }
    return { msg: "Post successfully updated!" };
  }

  async delete(_id: ObjectId) {
    const video_id = (await this.posts.readOne({ _id }))?.content;
    await this.posts.deleteOne({ _id });
    if (video_id) {
      await this.posts.deleteVideo(video_id);
    }
    return { msg: "Post deleted successfully!" };
  }

  /**
   * Extracts text out of video content posted previously
   * @param _id video content id
   * @returns the text that was spoken in the content
   */
  async getContentText(_id: ObjectId) {
    const content = await this.posts.readOne({ _id });
    if (content === null) {
      throw new NotFoundError(`Post ${_id} does not exist!`);
    }
    const downloaded_file = await this.posts.downloadVideo(content.content, "uploaded_video.mp4");
    // somehow get text
    const text = this.getFileText(downloaded_file);
    return text;
  }

  /**
   * Extracts text out of video file
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
