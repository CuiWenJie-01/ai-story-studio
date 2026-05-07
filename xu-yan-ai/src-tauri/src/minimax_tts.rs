use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Write as IoWrite;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsRequest {
    pub api_key: String,
    pub group_id: String,
    pub text: String,
    pub voice_id: String,
    pub speed: f32,
    pub volume: f32,
    pub pitch: i32,
    pub output_path: String,
    #[serde(default = "default_model")]
    pub model: String,
}

fn default_model() -> String {
    "speech-2.8-turbo".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TtsResponse {
    pub success: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
struct HttpTtsRequest {
    model: String,
    text: String,
    voice_setting: VoiceSetting,
    audio_setting: AudioSetting,
}

#[derive(Debug, Serialize)]
struct VoiceSetting {
    voice_id: String,
    speed: f32,
    vol: f32,
    pitch: i32,
}

#[derive(Debug, Serialize)]
struct AudioSetting {
    sample_rate: u32,
    bitrate: u32,
    format: String,
    channel: u8,
}

#[derive(Debug, Deserialize)]
struct HttpTtsResponse {
    data: Option<HttpData>,
    #[serde(rename = "base_resp")]
    base_resp: Option<BaseResp>,
}

#[derive(Debug, Deserialize)]
struct HttpData {
    audio: String,
}

#[derive(Debug, Deserialize)]
struct BaseResp {
    status_code: i32,
    status_msg: String,
}

#[tauri::command]
pub async fn minimax_text_to_speech(request: TtsRequest) -> Result<TtsResponse, String> {
    println!("[MiniMax TTS] 开始处理 TTS 请求");
    println!("[MiniMax TTS] Voice ID: {}", request.voice_id);
    println!("[MiniMax TTS] Text length: {} chars", request.text.len());

    let url = format!(
        "https://api.minimax.chat/v1/t2a_v2?GroupId={}",
        request.group_id
    );

    println!("[MiniMax TTS] API URL: {}", url);

    let http_request = HttpTtsRequest {
        model: request.model.clone(),
        text: request.text.clone(),
        voice_setting: VoiceSetting {
            voice_id: request.voice_id.clone(),
            speed: request.speed,
            vol: request.volume,
            pitch: request.pitch,
        },
        audio_setting: AudioSetting {
            sample_rate: 32000,
            bitrate: 128000,
            format: "mp3".to_string(),
            channel: 1,
        },
    };

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", request.api_key))
        .header("Content-Type", "application/json")
        .json(&http_request)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    println!("[MiniMax TTS] HTTP Status: {}", status);

    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    println!("[MiniMax TTS] Response length: {} bytes", response_text.len());

    let tts_response: HttpTtsResponse = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse response: {} - Response: {}", e, &response_text[..response_text.len().min(500)]))?;

    if let Some(base_resp) = &tts_response.base_resp {
        if base_resp.status_code != 0 {
            return Err(format!("API error: {} (code: {})", base_resp.status_msg, base_resp.status_code));
        }
    }

    let audio_hex = tts_response
        .data
        .map(|d| d.audio)
        .ok_or_else(|| "No audio data in response".to_string())?;

    // MiniMax API 默认返回 hex 格式的音频数据
    let audio_data = hex::decode(&audio_hex)
        .map_err(|e| format!("Failed to decode hex audio: {}", e))?;

    println!("[MiniMax TTS] Audio data size: {} bytes", audio_data.len());

    let output_path = PathBuf::from(&request.output_path);
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    let mut file = File::create(&output_path)
        .map_err(|e| format!("Failed to create output file: {}", e))?;

    file.write_all(&audio_data)
        .map_err(|e| format!("Failed to write audio data: {}", e))?;

    println!(
        "[MiniMax TTS] 音频已保存: {} ({} bytes)",
        output_path.display(),
        audio_data.len()
    );

    Ok(TtsResponse {
        success: true,
        path: Some(output_path.to_string_lossy().to_string()),
        error: None,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VoiceInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub gender: String,
    pub language: String,
}

pub const MINIMAX_VOICES: &[(&str, &str, &str, &str, &str)] = &[
    ("male-qn-qingse", "青涩青年音色", "清澈、年轻的男声", "male", "中文"),
    ("male-qn-jingying", "精英青年音色", "沉稳、专业的男声", "male", "中文"),
    ("male-qn-badao", "霸道青年音色", "强势、有力的男声", "male", "中文"),
    ("male-qn-daxuesheng", "青年大学生音色", "阳光、活力的男声", "male", "中文"),
    ("female-shaonv", "少女音色", "甜美、活泼的女声", "female", "中文"),
    ("female-yujie", "御姐音色", "成熟、优雅的女声", "female", "中文"),
    ("female-chengshu", "成熟女性音色", "稳重、知性的女声", "female", "中文"),
    ("female-tianmei", "甜美女性音色", "温柔、甜美的女声", "female", "中文"),
    ("male-qn-qingse-jingpin", "青涩青年音色-beta", "清澈、年轻的男声Beta版", "male", "中文"),
    ("male-qn-jingying-jingpin", "精英青年音色-beta", "沉稳、专业的男声Beta版", "male", "中文"),
    ("male-qn-badao-jingpin", "霸道青年音色-beta", "强势、有力的男声Beta版", "male", "中文"),
    ("male-qn-daxuesheng-jingpin", "青年大学生音色-beta", "阳光、活力的男声Beta版", "male", "中文"),
    ("female-shaonv-jingpin", "少女音色-beta", "甜美、活泼的女声Beta版", "female", "中文"),
    ("female-yujie-jingpin", "御姐音色-beta", "成熟、优雅的女声Beta版", "female", "中文"),
    ("female-chengshu-jingpin", "成熟女性音色-beta", "稳重、知性的女声Beta版", "female", "中文"),
    ("female-tianmei-jingpin", "甜美女性音色-beta", "温柔、甜美的女声Beta版", "female", "中文"),
    ("clever_boy", "聪明男童", "聪明伶俐的男童声", "male", "中文"),
    ("cute_boy", "可爱男童", "可爱活泼的男童声", "male", "中文"),
    ("lovely_girl", "萌萌女童", "萌萌可爱的女童声", "female", "中文"),
    ("cartoon_pig", "卡通猪小琪", "可爱的卡通猪角色", "neutral", "中文"),
    ("bingjiao_didi", "病娇弟弟", "病娇风格的弟弟声", "male", "中文"),
    ("junlang_nanyou", "俊朗男友", "俊朗帅气的男友声", "male", "中文"),
    ("chunzhen_xuedi", "纯真学弟", "纯真可爱的学弟声", "male", "中文"),
    ("lengdan_xiongzhang", "冷淡学长", "冷淡疏离的学长声", "male", "中文"),
    ("badao_shaoye", "霸道少爷", "霸道强势的少爷声", "male", "中文"),
    ("tianxin_xiaoling", "甜心小玲", "甜心可爱的小玲声", "female", "中文"),
    ("qiaopi_mengmei", "俏皮萌妹", "俏皮可爱的萌妹声", "female", "中文"),
    ("wumei_yujie", "妩媚御姐", "妩媚迷人的御姐声", "female", "中文"),
    ("diadia_xuemei", "嗲嗲学妹", "嗲嗲可爱的学妹声", "female", "中文"),
    ("danya_xuejie", "淡雅学姐", "淡雅优雅的学姐声", "female", "中文"),
    ("Chinese (Mandarin)_Reliable_Executive", "沉稳高管", "沉稳可靠的高管声", "male", "中文"),
    ("Chinese (Mandarin)_News_Anchor", "新闻女声", "专业新闻女声", "female", "中文"),
    ("Chinese (Mandarin)_Mature_Woman", "傲娇御姐", "傲娇成熟的御姐声", "female", "中文"),
    ("Chinese (Mandarin)_Unrestrained_Young_Man", "不羁青年", "不羁洒脱的青年声", "male", "中文"),
    ("Arrogant_Miss", "嚣张小姐", "嚣张傲慢的小姐声", "female", "中文"),
    ("Robot_Armor", "机械战甲", "机械科幻的战甲声", "neutral", "中文"),
    ("Chinese (Mandarin)_Kind-hearted_Antie", "热心大婶", "热心善良的大婶声", "female", "中文"),
    ("Chinese (Mandarin)_HK_Flight_Attendant", "港普空姐", "港普口音的空姐声", "female", "中文"),
    ("Chinese (Mandarin)_Humorous_Elder", "搞笑大爷", "幽默风趣的大爷声", "male", "中文"),
    ("Chinese (Mandarin)_Gentleman", "温润男声", "温润如玉的男声", "male", "中文"),
    ("Chinese (Mandarin)_Warm_Bestie", "温暖闺蜜", "温暖贴心的闺蜜声", "female", "中文"),
    ("Chinese (Mandarin)_Male_Announcer", "播报男声", "专业播报男声", "male", "中文"),
    ("Chinese (Mandarin)_Sweet_Lady", "甜美女声", "甜美动人的女声", "female", "中文"),
    ("Chinese (Mandarin)_Southern_Young_Man", "南方小哥", "南方口音的小哥声", "male", "中文"),
    ("Chinese (Mandarin)_Wise_Women", "阅历姐姐", "阅历丰富的姐姐声", "female", "中文"),
    ("Chinese (Mandarin)_Gentle_Youth", "温润青年", "温润温和的青年声", "male", "中文"),
    ("Chinese (Mandarin)_Warm_Girl", "温暖少女", "温暖可人的少女声", "female", "中文"),
    ("Chinese (Mandarin)_Kind-hearted_Elder", "花甲奶奶", "慈祥善良的奶奶声", "female", "中文"),
    ("Chinese (Mandarin)_Cute_Spirit", "憨憨萌兽", "憨憨可爱的萌兽声", "neutral", "中文"),
    ("Chinese (Mandarin)_Radio_Host", "电台男主播", "电台风格男主播", "male", "中文"),
    ("Chinese (Mandarin)_Lyrical_Voice", "抒情男声", "抒情动人的男声", "male", "中文"),
    ("Chinese (Mandarin)_Straightforward_Boy", "率真弟弟", "率真直爽的弟弟声", "male", "中文"),
    ("Chinese (Mandarin)_Sincere_Adult", "真诚青年", "真诚可靠的青年声", "male", "中文"),
    ("Chinese (Mandarin)_Gentle_Senior", "温柔学姐", "温柔体贴的学姐声", "female", "中文"),
    ("Chinese (Mandarin)_Stubborn_Friend", "嘴硬竹马", "嘴硬傲娇的竹马声", "male", "中文"),
    ("Chinese (Mandarin)_Crisp_Girl", "清脆少女", "清脆悦耳的少女声", "female", "中文"),
    ("Chinese (Mandarin)_Pure-hearted_Boy", "清澈邻家弟弟", "清澈纯真的邻家弟弟", "male", "中文"),
    ("Chinese (Mandarin)_Soft_Girl", "柔和少女", "柔和温婉的少女声", "female", "中文"),
    ("Cantonese_ProfessionalHost（F)", "专业女主持", "粤语专业女主持声", "female", "粤语"),
    ("Cantonese_GentleLady", "温柔女声", "粤语温柔女声", "female", "粤语"),
    ("Cantonese_ProfessionalHost（M)", "专业男主持", "粤语专业男主持声", "male", "粤语"),
    ("Cantonese_PlayfulMan", "活泼男声", "粤语活泼男声", "male", "粤语"),
    ("Cantonese_CuteGirl", "可爱女孩", "粤语可爱女孩声", "female", "粤语"),
    ("Cantonese_KindWoman", "善良女声", "粤语善良女声", "female", "粤语"),
    ("Santa_Claus", "Santa Claus", "圣诞老人声", "male", "英文"),
    ("Grinch", "Grinch", "格林奇声", "male", "英文"),
    ("Rudolph", "Rudolph", "鲁道夫声", "male", "英文"),
    ("Arnold", "Arnold", "阿诺德声", "male", "英文"),
    ("Charming_Santa", "Charming Santa", "迷人圣诞老人声", "male", "英文"),
    ("Charming_Lady", "Charming Lady", "迷人女士声", "female", "英文"),
    ("Sweet_Girl", "Sweet Girl", "甜美女孩声", "female", "英文"),
    ("Cute_Elf", "Cute Elf", "可爱精灵声", "neutral", "英文"),
    ("Attractive_Girl", "Attractive Girl", "迷人女孩声", "female", "英文"),
    ("Serene_Woman", "Serene Woman", "宁静女士声", "female", "英文"),
    ("English_Trustworthy_Man", "Trustworthy Man", "值得信赖的男士声", "male", "英文"),
    ("English_Graceful_Lady", "Graceful Lady", "优雅女士声", "female", "英文"),
    ("English_Aussie_Bloke", "Aussie Bloke", "澳洲男士声", "male", "英文"),
    ("English_Whispering_girl", "Whispering girl", "耳语女孩声", "female", "英文"),
    ("English_Diligent_Man", "Diligent Man", "勤奋男士声", "male", "英文"),
    ("English_Gentle-voiced_man", "Gentle-voiced man", "温和男士声", "male", "英文"),
    ("Japanese_IntellectualSenior", "Intellectual Senior", "知性前辈声", "male", "日文"),
    ("Japanese_DecisivePrincess", "Decisive Princess", "果断公主声", "female", "日文"),
    ("Japanese_LoyalKnight", "Loyal Knight", "忠诚骑士声", "male", "日文"),
    ("Japanese_DominantMan", "Dominant Man", "强势男士声", "male", "日文"),
    ("Japanese_SeriousCommander", "Serious Commander", "严肃指挥官声", "male", "日文"),
    ("Japanese_ColdQueen", "Cold Queen", "冷酷女王声", "female", "日文"),
    ("Japanese_DependableWoman", "Dependable Woman", "可靠女士声", "female", "日文"),
    ("Japanese_GentleButler", "Gentle Butler", "温柔管家声", "male", "日文"),
    ("Japanese_KindLady", "Kind Lady", "善良女士声", "female", "日文"),
    ("Japanese_CalmLady", "Calm Lady", "冷静女士声", "female", "日文"),
    ("Japanese_OptimisticYouth", "Optimistic Youth", "乐观青年声", "male", "日文"),
    ("Japanese_GenerousIzakayaOwner", "Generous Izakaya Owner", "慷慨居酒屋老板声", "male", "日文"),
    ("Japanese_SportyStudent", "Sporty Student", "运动学生声", "male", "日文"),
    ("Japanese_InnocentBoy", "Innocent Boy", "天真男孩声", "male", "日文"),
    ("Japanese_GracefulMaiden", "Graceful Maiden", "优雅少女声", "female", "日文"),
    ("Korean_SweetGirl", "Sweet Girl", "甜美女孩声", "female", "韩文"),
    ("Korean_CheerfulBoyfriend", "Cheerful Boyfriend", "开朗男友声", "male", "韩文"),
    ("Korean_EnchantingSister", "Enchanting Sister", "迷人姐姐声", "female", "韩文"),
    ("Korean_ShyGirl", "Shy Girl", "害羞女孩声", "female", "韩文"),
    ("Korean_ReliableSister", "Reliable Sister", "可靠姐姐声", "female", "韩文"),
    ("Korean_StrictBoss", "Strict Boss", "严厉老板声", "male", "韩文"),
    ("Korean_SassyGirl", "Sassy Girl", "时髦女孩声", "female", "韩文"),
    ("Korean_ChildhoodFriendGirl", "Childhood Friend Girl", "青梅竹马女孩声", "female", "韩文"),
    ("Korean_PlayboyCharmer", "Playboy Charmer", "花花公子声", "male", "韩文"),
    ("Korean_ElegantPrincess", "Elegant Princess", "优雅公主声", "female", "韩文"),
    ("Korean_BraveFemaleWarrior", "Brave Female Warrior", "勇敢女战士声", "female", "韩文"),
    ("Korean_BraveYouth", "Brave Youth", "勇敢青年声", "male", "韩文"),
    ("Korean_CalmLady", "Calm Lady", "冷静女士声", "female", "韩文"),
    ("Korean_EnthusiasticTeen", "Enthusiastic Teen", "热情少年声", "male", "韩文"),
    ("Korean_SoothingLady", "Soothing Lady", "抚慰女士声", "female", "韩文"),
    ("Korean_IntellectualSenior", "Intellectual Senior", "知性前辈声", "male", "韩文"),
    ("Korean_LonelyWarrior", "Lonely Warrior", "孤独战士声", "male", "韩文"),
    ("Korean_MatureLady", "Mature Lady", "成熟女士声", "female", "韩文"),
    ("Korean_InnocentBoy", "Innocent Boy", "天真男孩声", "male", "韩文"),
    ("Korean_CharmingSister", "Charming Sister", "迷人姐姐声", "female", "韩文"),
    ("Korean_AthleticStudent", "Athletic Student", "运动学生声", "male", "韩文"),
    ("Korean_BraveAdventurer", "Brave Adventurer", "勇敢冒险家声", "male", "韩文"),
    ("Korean_CalmGentleman", "Calm Gentleman", "冷静绅士声", "male", "韩文"),
    ("Korean_WiseElf", "Wise Elf", "智慧精灵声", "neutral", "韩文"),
    ("Korean_CheerfulCoolJunior", "Cheerful Cool Junior", "开朗酷学弟声", "male", "韩文"),
    ("Korean_DecisiveQueen", "Decisive Queen", "果断女王声", "female", "韩文"),
    ("Korean_ColdYoungMan", "Cold Young Man", "冷酷青年声", "male", "韩文"),
    ("Korean_MysteriousGirl", "Mysterious Girl", "神秘女孩声", "female", "韩文"),
    ("Korean_QuirkyGirl", "Quirky Girl", "古怪女孩声", "female", "韩文"),
    ("Korean_ConsiderateSenior", "Considerate Senior", "体贴前辈声", "male", "韩文"),
    ("Korean_CheerfulLittleSister", "Cheerful Little Sister", "开朗妹妹声", "female", "韩文"),
    ("Korean_DominantMan", "Dominant Man", "强势男士声", "male", "韩文"),
    ("Korean_AirheadedGirl", "Airheaded Girl", "天然呆女孩声", "female", "韩文"),
    ("Korean_ReliableYouth", "Reliable Youth", "可靠青年声", "male", "韩文"),
    ("Korean_FriendlyBigSister", "Friendly Big Sister", "友好姐姐声", "female", "韩文"),
    ("Korean_GentleBoss", "Gentle Boss", "温柔老板声", "male", "韩文"),
    ("Korean_ColdGirl", "Cold Girl", "冷酷女孩声", "female", "韩文"),
    ("Korean_HaughtyLady", "Haughty Lady", "傲慢女士声", "female", "韩文"),
    ("Korean_CharmingElderSister", "Charming Elder Sister", "迷人姐姐声", "female", "韩文"),
    ("Korean_IntellectualMan", "Intellectual Man", "知性男士声", "male", "韩文"),
    ("Korean_CaringWoman", "Caring Woman", "体贴女士声", "female", "韩文"),
    ("Korean_WiseTeacher", "Wise Teacher", "智慧老师声", "male", "韩文"),
    ("Korean_ConfidentBoss", "Confident Boss", "自信老板声", "male", "韩文"),
    ("Korean_AthleticGirl", "Athletic Girl", "运动女孩声", "female", "韩文"),
    ("Korean_PossessiveMan", "Possessive Man", "占有欲男士声", "male", "韩文"),
    ("Korean_GentleWoman", "Gentle Woman", "温柔女士声", "female", "韩文"),
    ("Korean_CockyGuy", "Cocky Guy", "自大男士声", "male", "韩文"),
    ("Korean_ThoughtfulWoman", "Thoughtful Woman", "体贴女士声", "female", "韩文"),
    ("Korean_OptimisticYouth", "Optimistic Youth", "乐观青年声", "male", "韩文"),
    ("Spanish_SereneWoman", "Serene Woman", "宁静女士声", "female", "西班牙文"),
    ("Spanish_MaturePartner", "Mature Partner", "成熟伴侣声", "male", "西班牙文"),
    ("Spanish_CaptivatingStoryteller", "Captivating Storyteller", "迷人讲述者声", "neutral", "西班牙文"),
    ("Spanish_Narrator", "Narrator", "叙述者声", "neutral", "西班牙文"),
    ("Spanish_WiseScholar", "Wise Scholar", "智慧学者声", "male", "西班牙文"),
    ("Spanish_Kind-heartedGirl", "Kind-hearted Girl", "善良女孩声", "female", "西班牙文"),
    ("Spanish_DeterminedManager", "Determined Manager", "果断经理声", "male", "西班牙文"),
    ("Spanish_BossyLeader", "Bossy Leader", "专横领导声", "male", "西班牙文"),
    ("Spanish_ReservedYoungMan", "Reserved Young Man", "内向青年声", "male", "西班牙文"),
    ("Spanish_ConfidentWoman", "Confident Woman", "自信女士声", "female", "西班牙文"),
    ("Spanish_ThoughtfulMan", "Thoughtful Man", "体贴男士声", "male", "西班牙文"),
    ("Spanish_Strong-WilledBoy", "Strong-willed Boy", "坚强男孩声", "male", "西班牙文"),
    ("Spanish_SophisticatedLady", "Sophisticated Lady", "精致女士声", "female", "西班牙文"),
    ("Spanish_RationalMan", "Rational Man", "理性男士声", "male", "西班牙文"),
    ("Spanish_animeCharacter", "Anime Character", "动漫角色声", "neutral", "西班牙文"),
    ("Spanish_Deep-tonedMan", "Deep-toned Man", "低沉男士声", "male", "西班牙文"),
    ("Spanish_Fussyhostess", "Fussy hostess", "挑剔女主人声", "female", "西班牙文"),
    ("Spanish_SincereTeen", "Sincere Teen", "真诚少年声", "male", "西班牙文"),
    ("Spanish_FrankLady", "Frank Lady", "坦率女士声", "female", "西班牙文"),
    ("Spanish_Comedian", "Comedian", "喜剧演员声", "neutral", "西班牙文"),
    ("Spanish_Debator", "Debator", "辩论者声", "neutral", "西班牙文"),
    ("Spanish_ToughBoss", "Tough Boss", "强硬老板声", "male", "西班牙文"),
    ("Spanish_Wiselady", "Wise Lady", "智慧女士声", "female", "西班牙文"),
    ("Spanish_Steadymentor", "Steady Mentor", "稳重导师声", "male", "西班牙文"),
    ("Spanish_Jovialman", "Jovial Man", "快乐男士声", "male", "西班牙文"),
    ("Spanish_SantaClaus", "Santa Claus", "圣诞老人声", "male", "西班牙文"),
    ("Spanish_Rudolph", "Rudolph", "鲁道夫声", "male", "西班牙文"),
    ("Spanish_Intonategirl", "Intonate Girl", "抑扬顿挫女孩声", "female", "西班牙文"),
    ("Spanish_Arnold", "Arnold", "阿诺德声", "male", "西班牙文"),
    ("Spanish_Ghost", "Ghost", "幽灵声", "neutral", "西班牙文"),
    ("Spanish_HumorousElder", "Humorous Elder", "幽默长者声", "male", "西班牙文"),
    ("Spanish_EnergeticBoy", "Energetic Boy", "活力男孩声", "male", "西班牙文"),
    ("Spanish_WhimsicalGirl", "Whimsical Girl", "异想天开女孩声", "female", "西班牙文"),
    ("Spanish_StrictBoss", "Strict Boss", "严厉老板声", "male", "西班牙文"),
    ("Spanish_ReliableMan", "Reliable Man", "可靠男士声", "male", "西班牙文"),
    ("Spanish_SereneElder", "Serene Elder", "宁静长者声", "male", "西班牙文"),
    ("Spanish_AngryMan", "Angry Man", "愤怒男士声", "male", "西班牙文"),
    ("Spanish_AssertiveQueen", "Assertive Queen", "自信女王声", "female", "西班牙文"),
    ("Spanish_CaringGirlfriend", "Caring Girlfriend", "体贴女友声", "female", "西班牙文"),
    ("Spanish_PowerfulSoldier", "Powerful Soldier", "强大士兵声", "male", "西班牙文"),
    ("Spanish_PassionateWarrior", "Passionate Warrior", "热情战士声", "male", "西班牙文"),
    ("Spanish_ChattyGirl", "Chatty Girl", "健谈女孩声", "female", "西班牙文"),
    ("Spanish_RomanticHusband", "Romantic Husband", "浪漫丈夫声", "male", "西班牙文"),
    ("Spanish_CompellingGirl", "Compelling Girl", "迷人女孩声", "female", "西班牙文"),
    ("Spanish_PowerfulVeteran", "Powerful Veteran", "强大老兵声", "male", "西班牙文"),
    ("Spanish_SensibleManager", "Sensible Manager", "明智经理声", "male", "西班牙文"),
    ("Spanish_ThoughtfulLady", "Thoughtful Lady", "体贴女士声", "female", "西班牙文"),
    ("Portuguese_SentimentalLady", "Sentimental Lady", "感性女士声", "female", "葡萄牙文"),
    ("Portuguese_BossyLeader", "Bossy Leader", "专横领导声", "male", "葡萄牙文"),
    ("Portuguese_Wiselady", "Wise lady", "智慧女士声", "female", "葡萄牙文"),
    ("Portuguese_Strong-WilledBoy", "Strong-willed Boy", "坚强男孩声", "male", "葡萄牙文"),
    ("Portuguese_Deep-VoicedGentleman", "Deep-voiced Gentleman", "低沉绅士声", "male", "葡萄牙文"),
    ("Portuguese_UpsetGirl", "Upset Girl", "不安女孩声", "female", "葡萄牙文"),
    ("Portuguese_PassionateWarrior", "Passionate Warrior", "热情战士声", "male", "葡萄牙文"),
    ("Portuguese_animeCharacter", "Anime Character", "动漫角色声", "neutral", "葡萄牙文"),
    ("Portuguese_ConfidentWoman", "Confident Woman", "自信女士声", "female", "葡萄牙文"),
    ("Portuguese_AngryMan", "Angry Man", "愤怒男士声", "male", "葡萄牙文"),
    ("Portuguese_CaptivatingStoryteller", "Captivating Storyteller", "迷人讲述者声", "neutral", "葡萄牙文"),
    ("Portuguese_Godfather", "Godfather", "教父声", "male", "葡萄牙文"),
    ("Portuguese_ReservedYoungMan", "Reserved Young Man", "内向青年声", "male", "葡萄牙文"),
    ("Portuguese_SmartYoungGirl", "Smart Young Girl", "聪明女孩声", "female", "葡萄牙文"),
    ("Portuguese_Kind-heartedGirl", "Kind-hearted Girl", "善良女孩声", "female", "葡萄牙文"),
    ("Portuguese_Pompouslady", "Pompous lady", "浮夸女士声", "female", "葡萄牙文"),
    ("Portuguese_Grinch", "Grinch", "格林奇声", "male", "葡萄牙文"),
    ("Portuguese_Debator", "Debator", "辩论者声", "neutral", "葡萄牙文"),
    ("Portuguese_SweetGirl", "Sweet Girl", "甜美女孩声", "female", "葡萄牙文"),
    ("Portuguese_AttractiveGirl", "Attractive Girl", "迷人女孩声", "female", "葡萄牙文"),
    ("Portuguese_ThoughtfulMan", "Thoughtful Man", "体贴男士声", "male", "葡萄牙文"),
    ("Portuguese_PlayfulGirl", "Playful Girl", "顽皮女孩声", "female", "葡萄牙文"),
    ("Portuguese_GorgeousLady", "Gorgeous Lady", "华丽女士声", "female", "葡萄牙文"),
    ("Portuguese_LovelyLady", "Lovely Lady", "可爱女士声", "female", "葡萄牙文"),
    ("Portuguese_SereneWoman", "Serene Woman", "宁静女士声", "female", "葡萄牙文"),
    ("Portuguese_SadTeen", "Sad Teen", "悲伤少年声", "male", "葡萄牙文"),
    ("Portuguese_MaturePartner", "Mature Partner", "成熟伴侣声", "male", "葡萄牙文"),
    ("Portuguese_Comedian", "Comedian", "喜剧演员声", "neutral", "葡萄牙文"),
    ("Portuguese_NaughtySchoolgirl", "Naughty Schoolgirl", "顽皮女学生声", "female", "葡萄牙文"),
    ("Portuguese_Narrator", "Narrator", "叙述者声", "neutral", "葡萄牙文"),
    ("Portuguese_ToughBoss", "Tough Boss", "强硬老板声", "male", "葡萄牙文"),
    ("Portuguese_Fussyhostess", "Fussy hostess", "挑剔女主人声", "female", "葡萄牙文"),
    ("Portuguese_Dramatist", "Dramatist", "戏剧家声", "neutral", "葡萄牙文"),
    ("Portuguese_Steadymentor", "Steady Mentor", "稳重导师声", "male", "葡萄牙文"),
    ("Portuguese_Jovialman", "Jovial Man", "快乐男士声", "male", "葡萄牙文"),
    ("Portuguese_CharmingQueen", "Charming Queen", "迷人女王声", "female", "葡萄牙文"),
    ("Portuguese_SantaClaus", "Santa Claus", "圣诞老人声", "male", "葡萄牙文"),
    ("Portuguese_Rudolph", "Rudolph", "鲁道夫声", "male", "葡萄牙文"),
    ("Portuguese_Arnold", "Arnold", "阿诺德声", "male", "葡萄牙文"),
    ("Portuguese_CharmingSanta", "Charming Santa", "迷人圣诞老人声", "male", "葡萄牙文"),
    ("Portuguese_CharmingLady", "Charming Lady", "迷人女士声", "female", "葡萄牙文"),
    ("Portuguese_Ghost", "Ghost", "幽灵声", "neutral", "葡萄牙文"),
    ("Portuguese_HumorousElder", "Humorous Elder", "幽默长者声", "male", "葡萄牙文"),
    ("Portuguese_CalmLeader", "Calm Leader", "冷静领导声", "male", "葡萄牙文"),
    ("Portuguese_GentleTeacher", "Gentle Teacher", "温柔老师声", "male", "葡萄牙文"),
    ("Portuguese_EnergeticBoy", "Energetic Boy", "活力男孩声", "male", "葡萄牙文"),
    ("Portuguese_ReliableMan", "Reliable Man", "可靠男士声", "male", "葡萄牙文"),
    ("Portuguese_SereneElder", "Serene Elder", "宁静长者声", "male", "葡萄牙文"),
    ("Portuguese_GrimReaper", "Grim Reaper", "死神声", "neutral", "葡萄牙文"),
    ("Portuguese_AssertiveQueen", "Assertive Queen", "自信女王声", "female", "葡萄牙文"),
    ("Portuguese_WhimsicalGirl", "Whimsical Girl", "异想天开女孩声", "female", "葡萄牙文"),
    ("Portuguese_StressedLady", "Stressed Lady", "压力女士声", "female", "葡萄牙文"),
    ("Portuguese_FriendlyNeighbor", "Friendly Neighbor", "友好邻居声", "neutral", "葡萄牙文"),
    ("Portuguese_CaringGirlfriend", "Caring Girlfriend", "体贴女友声", "female", "葡萄牙文"),
    ("Portuguese_PowerfulSoldier", "Powerful Soldier", "强大士兵声", "male", "葡萄牙文"),
    ("Portuguese_FascinatingBoy", "Fascinating Boy", "迷人男孩声", "male", "葡萄牙文"),
    ("Portuguese_RomanticHusband", "Romantic Husband", "浪漫丈夫声", "male", "葡萄牙文"),
    ("Portuguese_StrictBoss", "Strict Boss", "严厉老板声", "male", "葡萄牙文"),
    ("Portuguese_InspiringLady", "Inspiring Lady", "鼓舞女士声", "female", "葡萄牙文"),
    ("Portuguese_PlayfulSpirit", "Playful Spirit", "顽皮精灵声", "neutral", "葡萄牙文"),
    ("Portuguese_ElegantGirl", "Elegant Girl", "优雅女孩声", "female", "葡萄牙文"),
    ("Portuguese_CompellingGirl", "Compelling Girl", "迷人女孩声", "female", "葡萄牙文"),
    ("Portuguese_PowerfulVeteran", "Powerful Veteran", "强大老兵声", "male", "葡萄牙文"),
    ("Portuguese_SensibleManager", "Sensible Manager", "明智经理声", "male", "葡萄牙文"),
    ("Portuguese_ThoughtfulLady", "Thoughtful Lady", "体贴女士声", "female", "葡萄牙文"),
    ("Portuguese_TheatricalActor", "Theatrical Actor", "戏剧演员声", "neutral", "葡萄牙文"),
    ("Portuguese_FragileBoy", "Fragile Boy", "脆弱男孩声", "male", "葡萄牙文"),
    ("Portuguese_ChattyGirl", "Chatty Girl", "健谈女孩声", "female", "葡萄牙文"),
    ("Portuguese_Conscientiousinstructor", "Conscientious Instructor", "认真指导员声", "male", "葡萄牙文"),
    ("Portuguese_RationalMan", "Rational Man", "理性男士声", "male", "葡萄牙文"),
    ("Portuguese_WiseScholar", "Wise Scholar", "智慧学者声", "male", "葡萄牙文"),
    ("Portuguese_FrankLady", "Frank Lady", "坦率女士声", "female", "葡萄牙文"),
    ("Portuguese_DeterminedManager", "Determined Manager", "果断经理声", "male", "葡萄牙文"),
    ("French_Male_Speech_New", "Level-Headed Man", "冷静男士声", "male", "法文"),
    ("French_Female_News Anchor", "Patient Female Presenter", "耐心女主持声", "female", "法文"),
    ("French_CasualMan", "Casual Man", "随意男士声", "male", "法文"),
    ("French_MovieLeadFemale", "Movie Lead Female", "电影女主角声", "female", "法文"),
    ("French_FemaleAnchor", "Female Anchor", "女主持声", "female", "法文"),
    ("French_MaleNarrator", "Male Narrator", "男叙述者声", "male", "法文"),
    ("Indonesian_SweetGirl", "Sweet Girl", "甜美女孩声", "female", "印尼文"),
    ("Indonesian_ReservedYoungMan", "Reserved Young Man", "内向青年声", "male", "印尼文"),
    ("Indonesian_CharmingGirl", "Charming Girl", "迷人女孩声", "female", "印尼文"),
    ("Indonesian_CalmWoman", "Calm Woman", "冷静女士声", "female", "印尼文"),
    ("Indonesian_ConfidentWoman", "Confident Woman", "自信女士声", "female", "印尼文"),
    ("Indonesian_CaringMan", "Caring Man", "体贴男士声", "male", "印尼文"),
    ("Indonesian_BossyLeader", "Bossy Leader", "专横领导声", "male", "印尼文"),
    ("Indonesian_DeterminedBoy", "Determined Boy", "果断男孩声", "male", "印尼文"),
    ("Indonesian_GentleGirl", "Gentle Girl", "温柔女孩声", "female", "印尼文"),
    ("German_FriendlyMan", "Friendly Man", "友好男士声", "male", "德文"),
    ("German_SweetLady", "Sweet Lady", "甜美女士声", "female", "德文"),
    ("German_PlayfulMan", "Playful Man", "顽皮男士声", "male", "德文"),
    ("Russian_HandsomeChildhoodFriend", "Handsome Childhood Friend", "帅气青梅竹马声", "male", "俄文"),
    ("Russian_BrightHeroine", "Bright Queen", "明亮女王声", "female", "俄文"),
    ("Russian_AmbitiousWoman", "Ambitious Woman", "有抱负女士声", "female", "俄文"),
    ("Russian_ReliableMan", "Reliable Man", "可靠男士声", "male", "俄文"),
    ("Russian_CrazyQueen", "Crazy Girl", "疯狂女孩声", "female", "俄文"),
    ("Russian_PessimisticGirl", "Pessimistic Girl", "悲观女孩声", "female", "俄文"),
    ("Russian_AttractiveGuy", "Attractive Guy", "迷人男士声", "male", "俄文"),
    ("Russian_Bad-temperedBoy", "Bad-tempered Boy", "脾气暴躁男孩声", "male", "俄文"),
    ("Italian_BraveHeroine", "Brave Heroine", "勇敢女主角声", "female", "意大利文"),
    ("Italian_Narrator", "Narrator", "叙述者声", "neutral", "意大利文"),
    ("Italian_WanderingSorcerer", "Wandering Sorcerer", "流浪巫师声", "male", "意大利文"),
    ("Italian_DiligentLeader", "Diligent Leader", "勤奋领导声", "male", "意大利文"),
    ("Arabic_CalmWoman", "Calm Woman", "冷静女士声", "female", "阿拉伯文"),
    ("Arabic_FriendlyGuy", "Friendly Guy", "友好男士声", "male", "阿拉伯文"),
    ("Turkish_CalmWoman", "Calm Woman", "冷静女士声", "female", "土耳其文"),
    ("Turkish_Trustworthyman", "Trustworthy man", "值得信赖男士声", "male", "土耳其文"),
    ("Ukrainian_CalmWoman", "Calm Woman", "冷静女士声", "female", "乌克兰文"),
    ("Ukrainian_WiseScholar", "Wise Scholar", "智慧学者声", "male", "乌克兰文"),
    ("Dutch_kindhearted_girl", "Kind-hearted girl", "善良女孩声", "female", "荷兰文"),
    ("Dutch_bossy_leader", "Bossy leader", "专横领导声", "male", "荷兰文"),
    ("Vietnamese_kindhearted_girl", "Kind-hearted girl", "善良女孩声", "female", "越南文"),
    ("Thai_male_1_sample8", "Serene Man", "宁静男士声", "male", "泰文"),
    ("Thai_male_2_sample2", "Friendly Man", "友好男士声", "male", "泰文"),
    ("Thai_female_1_sample1", "Confident Woman", "自信女士声", "female", "泰文"),
    ("Thai_female_2_sample2", "Energetic Woman", "活力女士声", "female", "泰文"),
    ("Polish_male_1_sample4", "Male Narrator", "男叙述者声", "male", "波兰文"),
    ("Polish_male_2_sample3", "Male Anchor", "男主持声", "male", "波兰文"),
    ("Polish_female_1_sample1", "Calm Woman", "冷静女士声", "female", "波兰文"),
    ("Polish_female_2_sample3", "Casual Woman", "随意女士声", "female", "波兰文"),
    ("Romanian_male_1_sample2", "Reliable Man", "可靠男士声", "male", "罗马尼亚文"),
    ("Romanian_male_2_sample1", "Energetic Youth", "活力青年声", "male", "罗马尼亚文"),
    ("Romanian_female_1_sample4", "Optimistic Youth", "乐观青年声", "male", "罗马尼亚文"),
    ("Romanian_female_2_sample1", "Gentle Woman", "温柔女士声", "female", "罗马尼亚文"),
    ("greek_male_1a_v1", "Thoughtful Mentor", "体贴导师声", "male", "希腊文"),
    ("Greek_female_1_sample1", "Gentle Lady", "温柔女士声", "female", "希腊文"),
    ("Greek_female_2_sample3", "Girl Next Door", "邻家女孩声", "female", "希腊文"),
    ("czech_male_1_v1", "Assured Presenter", "自信主持声", "male", "捷克文"),
    ("czech_female_5_v7", "Steadfast Narrator", "坚定叙述者声", "neutral", "捷克文"),
    ("czech_female_2_v2", "Elegant Lady", "优雅女士声", "female", "捷克文"),
    ("finnish_male_3_v1", "Upbeat Man", "乐观男士声", "male", "芬兰文"),
    ("finnish_male_1_v2", "Friendly Boy", "友好男孩声", "male", "芬兰文"),
    ("finnish_female_4_v1", "Assetive Woman", "自信女士声", "female", "芬兰文"),
    ("hindi_male_1_v2", "Trustworthy Advisor", "值得信赖顾问声", "male", "印地文"),
    ("hindi_female_2_v1", "Tranquil Woman", "宁静女士声", "female", "印地文"),
    ("hindi_female_1_v2", "News Anchor", "新闻主持声", "neutral", "印地文"),
];

#[tauri::command]
pub fn get_minimax_voices() -> Vec<VoiceInfo> {
    MINIMAX_VOICES
        .iter()
        .map(|(id, name, description, gender, language)| VoiceInfo {
            id: id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            gender: gender.to_string(),
            language: language.to_string(),
        })
        .collect()
}
