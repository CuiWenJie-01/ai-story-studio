-- 性能优化：添加关键索引
-- 创建时间: 2024-01-01

-- dramas 表索引
CREATE INDEX IF NOT EXISTS idx_dramas_status ON dramas(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dramas_genre ON dramas(genre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dramas_updated_at ON dramas(updated_at DESC) WHERE deleted_at IS NULL;

-- episodes 表索引
CREATE INDEX IF NOT EXISTS idx_episodes_drama_id ON episodes(drama_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_episodes_drama_number ON episodes(drama_id, episode_number) WHERE deleted_at IS NULL;

-- storyboards 表索引（核心表，查询最频繁）
CREATE INDEX IF NOT EXISTS idx_storyboards_episode_id ON storyboards(episode_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_storyboards_episode_number ON storyboards(episode_id, storyboard_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_storyboards_scene_id ON storyboards(scene_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_storyboards_status ON storyboards(status) WHERE deleted_at IS NULL;

-- characters 表索引
CREATE INDEX IF NOT EXISTS idx_characters_drama_id ON characters(drama_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_characters_drama_sort ON characters(drama_id, sort_order, name) WHERE deleted_at IS NULL;

-- scenes 表索引
CREATE INDEX IF NOT EXISTS idx_scenes_drama_id ON scenes(drama_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scenes_episode_id ON scenes(episode_id) WHERE deleted_at IS NULL;

-- props 表索引
CREATE INDEX IF NOT EXISTS idx_props_drama_id ON props(drama_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_props_episode_id ON props(episode_id) WHERE deleted_at IS NULL;

-- storyboard_props 关联表索引
CREATE INDEX IF NOT EXISTS idx_sb_props_storyboard ON storyboard_props(storyboard_id);
CREATE INDEX IF NOT EXISTS idx_sb_props_prop ON storyboard_props(prop_id);

-- episode_characters 关联表索引
CREATE INDEX IF NOT EXISTS idx_ep_chars_episode ON episode_characters(episode_id);
CREATE INDEX IF NOT EXISTS idx_ep_chars_character ON episode_characters(character_id);

-- image_generations 表索引
CREATE INDEX IF NOT EXISTS idx_img_gen_storyboard ON image_generations(storyboard_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_img_gen_drama ON image_generations(drama_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_img_gen_character ON image_generations(character_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_img_gen_status ON image_generations(status) WHERE deleted_at IS NULL;

-- video_generations 表索引
CREATE INDEX IF NOT EXISTS idx_video_gen_storyboard ON video_generations(storyboard_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_video_gen_drama ON video_generations(drama_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_video_gen_status ON video_generations(status) WHERE deleted_at IS NULL;

-- video_merges 表索引
CREATE INDEX IF NOT EXISTS idx_video_merges_episode ON video_merges(episode_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_video_merges_drama ON video_merges(drama_id) WHERE deleted_at IS NULL;

-- async_tasks 表索引
CREATE INDEX IF NOT EXISTS idx_tasks_status ON async_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON async_tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_resource ON async_tasks(resource_id);

-- assets 表索引
CREATE INDEX IF NOT EXISTS idx_assets_drama ON assets(drama_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type) WHERE deleted_at IS NULL;

-- libraries 表索引
CREATE INDEX IF NOT EXISTS idx_char_lib_drama ON character_libraries(drama_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scene_lib_drama ON scene_libraries(drama_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prop_lib_drama ON prop_libraries(drama_id) WHERE deleted_at IS NULL;

-- ai_service_configs 表索引
CREATE INDEX IF NOT EXISTS idx_ai_config_type ON ai_service_configs(service_type);
CREATE INDEX IF NOT EXISTS idx_ai_config_active ON ai_service_configs(is_active);

-- 全文搜索索引（用于标题和描述搜索）
CREATE INDEX IF NOT EXISTS idx_dramas_title ON dramas(title) WHERE deleted_at IS NULL;
