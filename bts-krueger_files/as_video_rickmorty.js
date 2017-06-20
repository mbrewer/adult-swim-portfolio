if (typeof(crtg_content) !== "undefined"){
	var crtg_split = crtg_content.split(";");
	crtg_split.splice(crtg_split.length-1, 1);
	if (typeof window["AS"] === "undefined"){
		window.AS = {};
		window.AS.adTargets = {};
	}else if (typeof(window["AS"].adTargets) === "undefined"){
		window.AS.adTargets = {};
	}
	for (var i=0; i<crtg_split.length; i++){
		window["AS"].adTargets[(crtg_split[i].split("="))[0]] = (crtg_split[i].split("="))[1];
	}
}
AMPTManager.registry.push([
{
  "rktr_deployed_date": "2015-07-29 11:46:37",
  "rktr_slot_id": "page",
  "rktr_id": "as_video_rickmorty",
  "gpt_id": "8663477",
  "site": "as",
  "root": "AS",
  "targeting": [["transId", cnnad_transactionID], ["kuid", Krux.user], ["ksg", Krux.segments], ["guid", AMPTManager.readCookie("ug")], ["show",["rick_morty"]]]
},
{
  "rktr_slot_id": "ad_bnr_atf_01",
  "rktr_ad_id": "AS/video/rick_morty",
  "sizes": [[320,50],[728,90],[970,90],[970,66]],
  "targeting": [["pos",["bnr_atf_01"]]],
  "responsive":[[['970', '0'], [['728', '90'], ['970', '90'], ['970', '66']]], [['728', '0'], [['728', '90']]], [['320', '0'], [['320', '50']]], [['0', '0'], ['suppress']]]
},
{
  "rktr_slot_id": "ad_rect_atf_01",
  "rktr_ad_id": "AS/video/rick_morty",
  "sizes": [[300,250]],
  "targeting": [["pos",["rect_atf_01"]]],
  "responsive":[[['970', '0'], [['300', '250']]], [['728', '0'], ['suppress']], [['320', '0'], ['suppress']], [['0', '0'], ['suppress']]]
},
]);
