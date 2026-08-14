/**
 * Collection and list interfaces for user-organized content groupings.
 */

export interface Collection {
  collectionId: string;
  userId: string;
  name: string;
  type: 'manual' | 'smart';
  items: string[]; // titleIds
  smartFilter?: SmartFilter;
  createdAt: Date;
  updatedAt: Date;
}

export interface SmartFilter {
  minRating?: number;
  tags?: string[];
  isCompleted?: boolean;
  type?: 'movie' | 'series';
}

export interface CreateCollectionInput {
  name: string;
  type: 'manual' | 'smart';
  items?: string[];
  smartFilter?: SmartFilter;
}

export interface UpdateCollectionInput {
  name?: string;
  items?: string[];
  smartFilter?: SmartFilter;
}
