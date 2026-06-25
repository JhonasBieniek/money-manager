/** Tag opcional para receitas e despesas (hierárquica, 1 nível de sub-tags). */
export interface Tag {
  id: string;
  userId: string;
  name: string;
  color: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TagListResponse {
  items: Tag[];
}

export interface CreateTagResponse {
  id: string;
}

export interface CreateTagBody {
  name: string;
  color?: string;
  parentId?: string | null;
}

export interface UpdateTagBody {
  name?: string;
  color?: string;
  parentId?: string | null;
}
