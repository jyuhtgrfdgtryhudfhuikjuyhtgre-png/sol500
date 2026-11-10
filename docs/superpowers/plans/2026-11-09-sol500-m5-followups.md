# SOL 500 M5: follow-ups for later milestones

M5 (polish, the Quick mission and the Showcase) ships as version 3.7.0. The plan is `docs/superpowers/plans/2026-11-09-sol500-m5-polish-quick-showcase.md` and the design is `docs/superpowers/specs/2026-11-09-sol500-m5-polish-quick-showcase-design.md`. The follow-ups it still owes from earlier milestones are in the M4d, M4c, floor, M3 and M1 follow-ups docs in this folder.

This doc holds everything the task reviews, the final review and the QA deferred, so the build ledger (`.superpowers/sdd/2026-11-09-sol500-m5-polish-quick-showcase/`, git-ignored) isn't needed. Line numbers are those of the reviewed tree `5270e7e` unless a line says otherwise, and they drift: search for the function or string. Every Important and Critical finding was fixed before release; only Minor findings and the user's design calls are here.

## Measured

### Tests
795 of 795 on `5270e7e` (the last code change before the release commit): 668 at 3.6.0, 789 at the end of the feature tasks, 795 after the final review's fixes.

### The Full mission did not move
The final balance (`node tools/balance.js`, 1,000 seeds a level, commander, veteran and cadet) on `5270e7e` is **byte-identical** to 3.6.0's (`aba7f78`) on the same seeds, at all three levels: `diff` of the two outputs is empty. The final whole-branch review (`aba7f78..a03cca4`) checked the same promise another way: 120 Full missions (seed x level x crew x events) played to the end through `G.advance`, with forecast, advise, score, badges, `summarizeLoadout` and `upgradeMission` of a stripped old save, hash identically at `aba7f78` and `a03cca4`, and `LEVELS=commander BADGES=1 node tools/balance.js 200` is byte-identical at both. The fixes after that review (`a03cca4..5270e7e`) touched `referenceKit` only for a Quick mission, and the balance rerun above covers them.

### The Quick mission
`QUICK=1 node tools/balance.js` on `5270e7e`, 1,000 seeds a level, 4 crew, the reference Quick kit (8 rounds, flare in round 3, oxygen cut in round 5). Targets from spec §4: careless + explorer under 35 %; thoughtful + explorer over 70 %; S grades rare for sloppy play.

| Level | Bot | Success | Avg score | S per 1,000 |
|---|---|---|---|---|
| Cadet | Careless | 40.6 % | 913 | 196 |
| Cadet | Sloppy | 90.6 % | 1217 | 56 |
| Cadet | Thoughtful | 100.0 % | 1276 | 66 |
| Cadet | Careless + explorer | 56.2 % | 1064 | 412 |
| Cadet | Sloppy + explorer | 97.2 % | 1334 | 493 |
| Veteran | Careless | 13.9 % | 628 | 0 |
| Veteran | Sloppy | 78.6 % | 1052 | 0 |
| Veteran | Thoughtful | 99.8 % | 1204 | 0 |
| Veteran | Careless + explorer | 24.7 % | 715 | 5 |
| Veteran | Sloppy + explorer | 94.5 % | 1214 | 36 |
| Commander | Careless | 22.1 % | 753 | 51 |
| Commander | Sloppy | 85.2 % | 1160 | 47 |
| Commander | Thoughtful | 100.0 % | 1257 | 44 |
| Commander | Careless + explorer | **35.9 %** | 875 | 170 |
| Commander | Sloppy + explorer | 95.7 % | 1299 | 321 |

The commander kit variants, same seeds: thoughtful on a solar-only base 99.8 % (S 40); thoughtful with a reactor fortress 100.0 % (S 0); the rover-kit rows equal the reference rows above; careless with the naive rover kit (22 t) 0.0 %, all D. The final table has no thoughtful + explorer row; Task 3 measured it (commander, S 308 of 1,000).

**The two misses, and the user's call (2026-11-09, spec line 105: "a target that can't be met goes to the user").** On commander:
- Careless + explorer wins **35.9 %** against a target of under 35. The cadet row (56.2 %) and the veteran row (24.7 %) are the other levels.
- Sloppy + explorer earns S on **321** of 1,000 against a target of rare (under 100), and thoughtful + explorer 308. Sloppy and thoughtful explorers score alike over 8 rounds (median about 1,320), so no S cut separates them.

The user accepted the numbers as they are: the sloppy S target is read as the non-explorer rows (sloppy S **47** of 1,000, under 100), and careless + explorer at 35.9 % counts as met. Nothing was retuned for these.

## Release QA

<<QA>>

## For the user to decide

- **The reference Quick kit's red `water_short` warning.** The reference Quick kit shows a red "Water runs out before sol {end}" on the manifest at every level, true for 169 of the 200 sols; the Full reference kit shows none. Water 1 is what the user accepted in Task 3, and softening a warning to look better would make it less honest, so it stays by ruling. If a judge should not see red on the default kit, the lever is a threshold on the warning or one more water in `D.QUICK.kitChange` (which moves the balance above).
- **5-crew Quick survival has not been re-measured after the o2 fix.** The final review found `D.QUICK.kitChange` overwriting the five-crew +1 o2 (`src/engine.js` `referenceKit`); the fix applies `kitChange` first, so the 5-crew Quick kit has o2 2, one more than the 4-crew kit (a test pins it). The reviewer measured that kit by hand, commander, 200 seeds: careless + explorer 41.5 %, sloppy 90.5 %, sloppy + explorer 97 %, thoughtful 100 %; before the fix 12.5 %, 10.5 %, 61 %. The balance tool plays 4 crew, so these 5-crew figures are not in the table above. Careless + explorer at 41.5 % is over the 35 % target, as at 4 crew.
- **Grades are global across levels.** One band table grades every level, so cadet explorers earn S often in Quick (385 to 493 per 1,000) and veteran almost never (0 to 36). Per-level bands would be a rule change.

## Native Vietnamese read

113 Vietnamese strings were added or changed in `src/i18n.js` between 3.6.0 and the release (`git diff aba7f78..5270e7e -- src/i18n.js`), 77 new and 36 changed. The Showcase's 12 card names and purpose lines are among them (`show.card.<id>.name` and `.why`; the card words live in `src/i18n.js`, `src/showcase.js` holds only the ids and one line builder). Grouped by screen, English beside Vietnamese. A string with a note was named by a task review as one to read first:
- `show.crew.holds`, the landmark, beacons and rover purpose lines, and `eva.packKit` were rewritten late, after their pages were checked.
- "bão mặt trời" (solar storm) is capitalised as a card title in `show.card.flare.name` ("Bão mặt trời") and lower case in `quick.flareHint` and `show.card.flare.why`; the older `ev.spe` and `help.11` strings say "bão hạt Mặt Trời" (capital Mặt Trời): pick one term and one rule.

### Title and mission length (10)

| Key | EN | VI |
|---|---|---|
| `title.resumeDamaged` | That saved mission could not be read, so it was removed. | Không đọc được nhiệm vụ đã lưu này nên đã xóa nó. |
| `title.resumeQuick` | Resume Quick · sol {sol} | Tiếp tục nhiệm vụ nhanh · sol {sol} |
| `title.length` | Mission length | Độ dài nhiệm vụ |
| `length.full` | Full · 500 sols | Đầy đủ · 500 sol |
| `length.quick` | Quick · 200 sols | Nhanh · 200 sol |
| `length.fullHint` | 20 rounds. The whole mission, with every season, storm and decision. | 20 vòng. Cả nhiệm vụ, với đủ mùa, bão và quyết định. |
| `length.quickHint` | 8 rounds, solo only. Set moments: a solar flare in round 3 and an oxygen leak in round 5. A rover comes in place of the water wall. No training mode. | 8 vòng, chỉ chơi một mình. Có các khoảnh khắc định sẵn: bão mặt trời ở vòng 3 và rò rỉ oxy ở vòng 5. Xe thám hiểm thay cho tường nước. Không có chế độ huấn luyện. |
| `quick.tag` | Quick mission | Nhiệm vụ nhanh |
| `quick.flareHint` **lower case: "bão mặt trời" capitalisation** | A solar flare is due this round. Step outside with the rover and get back under cover in time. | Vòng này sẽ có bão mặt trời. Hãy ra ngoài bằng xe thám hiểm và quay về chỗ trú kịp lúc. |
| `title.operate.body` (changed) | Rounds of 25 sols: assign the crew, build, answer emergencies. | Mỗi vòng 25 sol: phân công, xây dựng, xử lý sự cố. |

### Showcase (the 12 cards and the gallery) (33)

| Key | EN | VI |
|---|---|---|
| `show.title` | What SOL 500 can do | SOL 500 làm được gì |
| `show.open` | Showcase | Trình diễn |
| `show.me` | Show me | Cho tôi xem |
| `show.next` | Next | Tiếp |
| `show.back` | ‹ Showcase | ‹ Trình diễn |
| `show.why` | Why it's here | Vì sao có tính năng này |
| `show.crew.holds` **named in the ledger** | The same hold at the weather station: Commander {a} s, Engineer {b} s. | Cùng một lần giữ phím ở trạm khí tượng: chỉ huy trưởng {a} giây, kỹ sư {b} giây. |
| `show.failed` | That scene could not be set up. You are back on the gallery. | Không dựng được cảnh đó. Bạn đã quay lại thư viện. |
| `show.exit` | Exit to Admin | Thoát về trang Quản trị |
| `show.card.flare.name` **capital B: "bão mặt trời" capitalisation** | Solar flare | Bão mặt trời |
| `show.card.flare.why` | NASA lists space radiation as one of the five hazards of human spaceflight. In the game a flare gives a short warning, and your dose depends on whether you reach cover in time. | NASA xếp bức xạ vũ trụ là một trong năm mối nguy của chuyến bay vũ trụ có người. Trong game, bão mặt trời cho một lời cảnh báo ngắn, và liều bức xạ của bạn tùy việc bạn có kịp vào chỗ trú hay không. |
| `show.card.rover.name` | Physics rover | Xe thám hiểm theo vật lý |
| `show.card.rover.why` **named in the ledger (reworded)** | Mars has weaker gravity than Earth, so the wheels grip less and the rover needs more room to stop. The readout shows both distances: brake early. | Sao Hỏa có trọng lực yếu hơn Trái Đất, nên bánh xe bám đường kém hơn và xe thám hiểm cần nhiều chỗ để dừng hơn. Bảng đọc cho thấy cả hai quãng đường: hãy phanh sớm. |
| `show.card.oxygen.name` | Oxygen cut | Đứt đường oxy |
| `show.card.oxygen.why` | A rupture in the oxygen line leaves two choices: seal off and hide, or send a team out for the lander's tanks. Each has a real cost, and the rules show it. | Đường oxy bị vỡ để lại hai lựa chọn: đóng kín rồi trú ẩn, hay cử người ra lấy bình dự trữ của tàu đổ bộ. Mỗi lựa chọn có một cái giá thật, và luật chơi cho bạn thấy. |
| `show.card.beacons.name` | Relay beacons | Trạm chuyển tiếp |
| `show.card.beacons.why` **named in the ledger (reworded)** | Most data from Mars rovers goes first to the orbiters overhead, which relay it to Earth. In the game, beacons placed away from the base mark the route home and refill your suit. | Phần lớn dữ liệu từ các xe thám hiểm sao Hỏa được gửi trước tiên lên các tàu quỹ đạo phía trên, rồi chúng chuyển về Trái Đất. Trong game, các trạm chuyển tiếp đặt xa căn cứ đánh dấu đường về và nạp lại bộ đồ của bạn. |
| `show.card.ground.name` | NASA photo ground | Mặt đất từ ảnh NASA |
| `show.card.ground.why` | NASA's Ingenuity helicopter took the first color photo of Mars from the air. The game's ground is painted from NASA images like it, one look for each of the six regions. | Trực thăng Ingenuity của NASA đã chụp bức ảnh màu đầu tiên về sao Hỏa từ trên không. Mặt đất trong game được vẽ từ những ảnh NASA như vậy, mỗi vùng trong sáu vùng một vẻ. |
| `show.card.landmark.name` | Landmarks | Địa danh |
| `show.card.landmark.why` **named in the ledger (reworded)** | NASA's Perseverance rover is studying an ancient delta, formed where a river met a lake. The game places real kinds of Martian landmark, and discovering one gives you its NASA facts. | Xe thám hiểm Perseverance của NASA đang nghiên cứu một châu thổ cổ, hình thành nơi một dòng sông gặp một cái hồ. Game đặt những loại địa danh thật của sao Hỏa, và khám phá một nơi sẽ cho bạn các dữ kiện của NASA về nó. |
| `show.card.tube.name` | Lava tubes and caves | Ống dung nham và hang động |
| `show.card.tube.why` | NASA images show pit craters where the roof of a lava tube has collapsed, and empty tubes may criss-cross Mars's giant volcanoes. In the game, walk into a tube's mouth and into the dark. | Ảnh NASA cho thấy những hố sụt nơi mái của một ống dung nham đã sập, và các ống rỗng có thể chạy ngang dọc dưới những ngọn núi lửa khổng lồ của sao Hỏa. Trong game, hãy đi tới miệng một ống và bước vào bóng tối. |
| `show.card.devils.name` | Dust devils and storms | Lốc bụi và bão bụi |
| `show.card.devils.why` | NASA photographs the dark tracks that dust devils scour into the surface of Mars. In the game, a dust-devil round costs suit time if one catches you in the open, and a storm shortens how far you see. | NASA chụp được những vệt tối mà lốc bụi cày lên bề mặt sao Hỏa. Trong game, một vòng có lốc bụi làm hao bộ đồ nếu bạn bị bắt gặp ngoài trời, và bão bụi làm tầm nhìn hẹp lại. |
| `show.card.isru.name` | Growing food and making oxygen | Trồng thực phẩm và tạo oxy |
| `show.card.isru.why` | NASA's Veggie garden on the space station adds fresh food to astronauts' diets. The Console shows the game's greenhouse and the oxygen systems that keep the crew fed and breathing. | Vườn Veggie của NASA trên trạm vũ trụ bổ sung thực phẩm tươi cho bữa ăn của phi hành gia. Bảng điều khiển cho thấy nhà kính và các hệ thống oxy trong game giúp phi hành đoàn có ăn và có thở. |
| `show.card.crew.name` | Crew roles and skills | Vai trò và kỹ năng của phi hành đoàn |
| `show.card.crew.why` | Each crew member has a role with its own skill, so a job can take a different time for each: an Engineer works a weather station in half the time. The commander's aura speeds up the crew near him. | Mỗi thành viên có một vai trò với kỹ năng riêng, nên một việc có thể mất thời gian khác nhau với từng người: kỹ sư sửa trạm khí tượng trong nửa thời gian. Hào quang của chỉ huy giúp cả đội gần anh ấy đi nhanh hơn. |
| `show.card.story.name` | Why Mars? | Vì sao là sao Hỏa? |
| `show.card.story.why` | In July 1969 Apollo 11 put the first two people on the Moon. The story follows that road on towards Mars. | Tháng 7 năm 1969, Apollo 11 đưa hai người đầu tiên lên Mặt Trăng. Câu chuyện đi tiếp con đường đó về phía sao Hỏa. |
| `show.card.guide.name` | Field guide | Sổ tay thực địa |
| `show.card.guide.why` | The guide explains every item and module in the game, with the facts behind each one. | Sổ tay giải thích từng vật phẩm và mô-đun trong game, cùng những dữ kiện đằng sau mỗi thứ. |

### Console, warnings and advice (10)

| Key | EN | VI |
|---|---|---|
| `mwarn.storm_risk` (changed) | A global dust storm would leave the HQ without enough power. Opportunity died this way in 2018. | Một cơn bão bụi toàn cầu sẽ khiến HQ thiếu điện. Xe thám hiểm Opportunity đã chết như vậy năm 2018. |
| `mwarn.o2_short` (changed) | Oxygen runs out before sol {end}. | Oxy hết trước sol {end}. |
| `mwarn.water_short` (changed) | Water runs out before sol {end}, even after draining the water wall. | Nước hết trước sol {end}, kể cả khi xả tường nước. |
| `mwarn.food_short` (changed) | Food runs out before sol {end} unless you grow or order more. | Thực phẩm hết trước sol {end} nếu không trồng hoặc đặt thêm. |
| `season.autumn.short` | Autumn · dust season | Mùa thu · mùa bão bụi |
| `season.winter.short` | Winter · dust season | Mùa đông · mùa bão bụi |
| `season.spring.short` | Spring | Mùa xuân |
| `season.summer.short` | Summer | Mùa hè |
| `bld.kitReal` (changed) | Real Mars rovers send most of their data to Earth through orbiters overhead, called the Mars Relay Network; the ground beacons in this game are fictional. | Các xe thám hiểm thật trên sao Hỏa gửi phần lớn dữ liệu về Trái Đất qua các tàu quỹ đạo bay phía trên, gọi là Mạng chuyển tiếp sao Hỏa (Mars Relay Network); các trạm chuyển tiếp mặt đất trong trò chơi này là hư cấu. |
| `advice.dose_projection` (changed) | At this rate {name} passes the 300 mSv budget before sol {end}. Build shield layers or move them indoors. | Cứ đà này {name} sẽ vượt 300 mSv trước sol {end}. Xây thêm lớp che chắn hoặc cho người đó làm việc trong nhà. |

### Events and debrief (10)

| Key | EN | VI |
|---|---|---|
| `ev.landing_quick.title` | Touchdown | Chạm đất |
| `ev.landing_quick.body` **check "bão"** | The lander is down and the HQ is pressurized. Two hundred sols until the early return window. Eight rounds, and two moments you cannot skip. Assign the crew, check the forecast, then advance. | Tàu đã hạ cánh và HQ đã điều áp. Còn 200 sol đến cửa sổ trở về sớm. Tám vòng, và hai khoảnh khắc không thể bỏ qua. Phân công phi hành đoàn, xem dự báo, rồi tiến lên. |
| `ev.dust_global.body` (changed) | Dust covers the whole planet. Solar arrays deliver about 8 % of normal. It can last three rounds. In 2018 a storm like this ended the Opportunity rover. | Bụi phủ kín cả hành tinh. Dàn pin chỉ còn khoảng 8 % công suất, có thể kéo dài ba vòng. Năm 2018, một cơn bão như vậy đã chấm dứt xe thám hiểm Opportunity. |
| `ev.spe.shelter.hint` (changed) | Everyone in the shielded core: less work, only a few mSv. Crew out on the surface still need cover from the flare. | Mọi người vào lõi được che chắn: ít việc hơn, chỉ vài mSv. Ai đang ở ngoài căn cứ, trên bề mặt sao Hỏa, vẫn phải tìm nơi trú ẩn khỏi bão hạt Mặt Trời. |
| `deb.successBody` (changed) | {n} of {m} crew lift off for home on sol {end}. | {n}/{m} phi hành gia cất cánh về nhà vào sol {end}. |
| `lesson.storm_solar.body` (changed) | A global dust storm hit while most of your power came from the Sun. In 2018 one of these storms blocked sunlight for months and ended the Opportunity rover. That is why NASA is developing fission surface power for crewed missions. | Một cơn bão bụi toàn cầu ập đến khi phần lớn điện của bạn đến từ Mặt Trời. Năm 2018, một cơn bão như vậy che nắng nhiều tháng và chấm dứt xe thám hiểm Opportunity. Vì thế NASA đang phát triển lò phân hạch trên bề mặt cho các sứ mệnh có người. |
| `lesson.spares.body` (changed) | Breakdowns are certain on a {end}-sol mission. What matters is whether someone can fix them: a crew member on maintenance, spare kits, and materials to improvise with. | Hỏng hóc là chắc chắn trong {end} sol. Điều quan trọng là có ai sửa được không: một người làm bảo trì, phụ tùng, và vật liệu để tự chế. |
| `lesson.food.body` (changed) | Packaged food for {end} sols weighs tonnes. Hydroponics trade mass for power and crew time, and the first harvest comes only after a crop cycle. | Đồ ăn đóng gói cho {end} sol nặng hàng tấn. Thủy canh đổi khối lượng lấy điện và công sức, và vụ đầu tiên chỉ có sau một chu kỳ trồng. |
| `lesson.isruMars.body` (changed) | ISRU, or in-situ resource utilization, means making what astronauts need from local materials instead of bringing large quantities from Earth. MOXIE, an experiment on NASA's Perseverance rover, made 122 grams of oxygen from the carbon dioxide in Mars's thin air in 16 runs between 2021 and 2023. At its best it made 12 grams of oxygen an hour, at 98% purity or better. Water ice lies underground across Mars's mid-latitudes; crews could harvest it for drinking water, or split it into hydrogen and oxygen for rocket fuel and breathable air. In the game, the ice and metal you haul home are ISRU too: supplies found on Mars, not launched from Earth. | ISRU, hay khai thác tài nguyên tại chỗ (in-situ resource utilization), nghĩa là làm ra những thứ phi hành gia cần từ vật liệu tại chỗ, thay vì mang theo số lượng lớn từ Trái Đất. MOXIE, một thí nghiệm trên xe thám hiểm Perseverance của NASA, đã tạo ra 122 gam oxy từ khí CO₂ trong bầu khí quyển mỏng của sao Hỏa qua 16 lần chạy từ năm 2021 đến 2023. Lúc tốt nhất, nó tạo ra 12 gam oxy mỗi giờ, với độ tinh khiết từ 98% trở lên. Băng nước nằm dưới lòng đất ở khắp các vùng vĩ độ trung bình của sao Hỏa; các phi hành đoàn có thể khai thác băng để làm nước uống, hoặc tách nó thành hydro và oxy để làm nhiên liệu tên lửa và khí thở. Trong trò chơi, băng và kim loại bạn mang về cũng là ISRU: nguồn cung tìm thấy trên sao Hỏa, chứ không phải phóng lên từ Trái Đất. |
| `goal.haul` (changed) | Bring home {n} loads of ice or metal | Mang về {n} phần hàng băng hoặc kim loại |

### Surface: the EVA panel, hints and map key (27)

| Key | EN | VI |
|---|---|---|
| `haul.o2` (changed) | +{n} kg O₂ in canisters | +{n} kg O₂ trong bình |
| `haul.spares1` | +{n} spare kit | +{n} bộ phụ tùng |
| `haul.kit1` | +{n} relay beacon kit | +{n} bộ trạm chuyển tiếp |
| `eva.nothing` (changed) | Nothing yet. Walk out of the base: ice, metal-rich rock, cargo pods and science sites lie on the map. Hold E by one to load it, then bring it back inside the dashed square around the HQ. | Chưa có gì. Hãy đi ra khỏi căn cứ: băng, đá giàu kim loại, khoang hàng và địa điểm khoa học nằm trên bản đồ. Giữ phím E bên cạnh để chất hàng, rồi mang về trong ô vuông nét đứt quanh căn cứ. |
| `eva.battery` (changed) | Rover battery | Pin xe thám hiểm |
| `eva.packKit` **named in the ledger** | Backpack: {n} loads and {k} relay beacon kits, {m} slots | Ba lô: {n} phần hàng và {k} bộ trạm chuyển tiếp, {m} ngăn |
| `eva.flat` (changed) | The rover battery is flat until tomorrow: press E to get out and walk. | Pin xe thám hiểm đã cạn đến ngày mai: nhấn E để xuống xe và đi bộ. |
| `eva.err.taken` (changed) | Someone else is driving the rover. | Người khác đang lái xe thám hiểm. |
| `eva.err.flat` (changed) | The rover's battery is flat until tomorrow. | Pin xe thám hiểm đã cạn đến ngày mai. |
| `eva.err.noRover` (changed) | The rover is out of action. | Xe thám hiểm đang không hoạt động. |
| `eva.err.noRoom` | This room has closed. | Phòng này đã đóng. |
| `eva.err.slowDown` | Too many actions at once: wait a moment. | Thao tác quá nhanh: hãy đợi một chút. |
| `eva.err.notAtBase` (changed) | That only works inside the dashed square around the HQ. | Việc này chỉ làm được trong ô vuông nét đứt quanh căn cứ. |
| `eva.err.notDriving` (changed) | You are not driving the rover. | Bạn đang không lái xe thám hiểm. |
| `eva.cond.flare` (changed) | Solar flare: {w} s after anyone steps outside, a {c} s countdown starts. Be under cover when it ends (the base, a cave, a lava tube, a hab pod or the storm shelter), or take +{d} mSv. | Bão hạt Mặt Trời: {w} giây sau khi có người bước ra ngoài, đồng hồ đếm ngược {c} giây bắt đầu. Hãy ở nơi trú ẩn khi hết giờ (căn cứ, hang, ống dung nham, khoang sinh hoạt hoặc hầm trú bão), nếu không sẽ nhận +{d} mSv. |
| `sf.hintRover` (changed) | In the rover: steer with WASD or the arrows · hold Shift to boost (the battery drains twice as fast) · drive over rocks and crater rims, slowly · E to get out | Trên xe thám hiểm: lái bằng WASD hoặc phím mũi tên · giữ Shift để tăng tốc (pin hao gấp đôi) · có thể chạy chậm qua đá và vành hố va chạm · E để xuống xe |
| `sf.hintRoverTouch` (changed) | In the rover: drag the stick to steer · hold » to boost (the battery drains twice as fast) · drive over rocks and crater rims, slowly · tap E to get out | Trên xe thám hiểm: kéo cần điều khiển để lái · giữ » để tăng tốc (pin hao gấp đôi) · có thể chạy chậm qua đá và vành hố va chạm · chạm E để xuống xe |
| `sf.key.find` | A find to collect | Vật cần thu thập |
| `sf.key.cave` | Cave mouth | Miệng hang |
| `sf.key.drop` | Dropped load | Hàng đã bỏ lại |
| `sf.key.rover` | Parked rover | Xe thám hiểm đang đỗ |
| `sf.key.beacon` | Relay beacon | Trạm chuyển tiếp |
| `sf.key.landmark` | Landmark discovered | Địa danh đã khám phá |
| `sf.key.structure` | Structure used or repaired | Công trình đã dùng hoặc sửa |
| `sf.key.mast` | Comms mast, not yet repaired | Cột liên lạc, chưa sửa |
| `sf.key.base` | The base | Căn cứ |
| `sf.key.you` | You | Bạn |

### Field guide, finds and regions (7)

| Key | EN | VI |
|---|---|---|
| `guide.pack.desc` (changed) | Carries what you load out there (ice, metal-rich rock, cargo, science samples) back to the base: 3 loads on foot, 8 in the rover. | Mang những gì bạn thu nhặt ngoài kia (băng, đá giàu kim loại, hàng hóa, mẫu khoa học) về căn cứ: 3 món khi đi bộ, 8 món khi lái xe thám hiểm. |
| `guide.kit.desc` (changed) | Built at the HQ and carried out: set down far from the base, a relay beacon refills suits and marks the route home. | Được chế tạo ở HQ rồi mang ra ngoài: đặt xa căn cứ, trạm chuyển tiếp nạp lại bộ đồ và đánh dấu đường về. |
| `item.battery.fact` (changed) | A Mars sol lasts 24 h 39 min. | Một sol dài 24 giờ 39 phút. |
| `find.wreck` (changed) | Wrecked scout rover | Xác xe thám hiểm trinh sát |
| `sci.vent` (changed) | methane vent | lỗ thoát khí mêtan |
| `region.fact.plains` (changed) | Like the floor of Jezero Crater, where Perseverance landed. About 3.5 billion years ago this 45-km crater had its own river delta and was filled with water. “Jezero” means “lake” in many Slavic languages. | Giống như đáy hố Jezero, nơi tàu Perseverance hạ cánh. Khoảng 3,5 tỷ năm trước, hố rộng 45 km này từng có châu thổ sông riêng và chứa đầy nước. “Jezero” nghĩa là “hồ” trong nhiều ngôn ngữ Slav. |
| `ks.wreck.name` (changed) | Wrecked scout rover | Xác xe thám hiểm trinh sát |

### Crew roles (6)

| Key | EN | VI |
|---|---|---|
| `role.commander.fact` | In NASA's 378-day Mars simulation, the commander's role was pivotal in maintaining crew morale and ensuring the success of daily operations. | Trong cuộc mô phỏng sao Hỏa 378 ngày của NASA, vai trò của chỉ huy trưởng là then chốt trong việc giữ tinh thần phi hành đoàn và bảo đảm các hoạt động hằng ngày diễn ra thành công. |
| `role.scientist.fact` | Harrison “Jack” Schmitt, a geologist and the Apollo 17 lunar module pilot, was the first scientist to step on the Moon. | Harrison “Jack” Schmitt, nhà địa chất và phi công module đổ bộ của Apollo 17, là nhà khoa học đầu tiên đặt chân lên Mặt Trăng. |
| `role.engineer.fact` | Four spacewalks in 2019 and 2020 replaced the failing cooling pumps of the space station's AMS-02, which was not designed to be repaired. | Bốn chuyến đi bộ ngoài không gian năm 2019 và 2020 đã thay các máy bơm làm mát đang hỏng của AMS-02 trên trạm vũ trụ, thiết bị vốn không được thiết kế để sửa chữa. |
| `role.biologist.fact` | To date, NASA's Veggie has grown plants in space including three types of lettuce, Chinese cabbage, mizuna mustard, a red kale and zinnia flowers. | Đến nay, Veggie của NASA đã trồng trong không gian ba loại xà lách, cải thảo, cải mizuna, một loại cải xoăn đỏ và hoa cúc zinnia. |
| `role.medic.fact` | A NASA Crew Medical Officer is a crew member assigned as a mission's medical expert. NASA requires at least two trained per vehicle or platform. | Sĩ quan y tế của phi hành đoàn (CMO) của NASA là thành viên được giao làm chuyên gia y tế cho một nhiệm vụ. NASA yêu cầu huấn luyện ít nhất hai người cho mỗi phương tiện hoặc nền tảng. |
| `role.commander.seat` | Comes with the fifth seat: a mission with 4 crew has no commander. | Đi kèm chỗ ngồi thứ năm: nhiệm vụ 4 người không có chỉ huy trưởng. |

### Help (3)

| Key | EN | VI |
|---|---|---|
| `help.10` (changed) | Bring things home: ice, metal-rich rock, crashed cargo pods and science sites lie out on the map. Stand by one and hold E (or the action button) to load it into your backpack (3 loads, 8 in the rover), then walk back inside the dashed square around the HQ to deliver. Your suit holds 150 s of oxygen outside each round and pauses at the base; if it runs out you collapse. Deliveries count when the round advances. | Mang về căn cứ: băng, đá giàu kim loại, khoang hàng bị rơi và địa điểm khoa học nằm rải rác trên bản đồ. Đứng cạnh và giữ phím E (hoặc nút hành động) để chất vào ba lô (3 phần, 8 phần khi đi xe thám hiểm), rồi đi vào trong ô vuông nét đứt quanh căn cứ để giao hàng. Bộ đồ du hành có 150 giây oxy bên ngoài mỗi vòng và tạm dừng khi ở căn cứ; nếu hết oxy bạn sẽ ngã gục. Hàng giao sẽ được tính khi sang vòng mới. |
| `help.11` (changed) | Dangers outside: a solar flare gives a {c} s warning. Be at the base, in a cave (a dark arch at the foot of a cliff), a lava tube, a hab pod or the storm shelter when it ends, or take +{d} mSv. Dust devils throw you aside and take {s} s of suit, so walk round them (the rover is safe). A dust storm shrinks how far you can see. | Nguy hiểm bên ngoài: bão hạt Mặt Trời báo trước {c} giây. Hãy ở căn cứ, trong hang (vòm tối dưới chân vách đá), ống dung nham, khoang sinh hoạt hoặc hầm trú bão khi hết giờ, nếu không sẽ nhận +{d} mSv. Lốc bụi hất bạn sang bên và lấy {s} giây oxy bộ đồ, nên hãy đi vòng qua (xe thám hiểm thì an toàn). Bão bụi làm bạn nhìn thấy gần hơn. |
| `help.win` | Windows warnings (the desktop app): the installer is not signed, so SmartScreen may say "Windows protected your PC". Click "More info", then "Run anyway". The first time SOL 500 starts, the Windows Firewall asks whether to allow it on your network: allow it on private networks so friends on your Wi-Fi can join. The app installs for your user only, in %LOCALAPPDATA%\Programs\sol500. | Cảnh báo của Windows (ứng dụng máy tính): bộ cài chưa được ký số nên SmartScreen có thể báo "Windows protected your PC". Hãy bấm "More info", rồi "Run anyway". Lần đầu SOL 500 chạy, Windows Firewall sẽ hỏi có cho phép dùng mạng không: hãy cho phép trên mạng riêng (Private) để bạn bè cùng Wi-Fi vào được. Ứng dụng chỉ cài cho tài khoản của bạn, trong %LOCALAPPDATA%\Programs\sol500. |

### Online, LAN and the app (5)

| Key | EN | VI |
|---|---|---|
| `online.errorHash` | The link tool did not download correctly (its checksum failed). Try again; if it keeps failing, check the internet connection. | Công cụ tạo link tải về không đúng (sai mã kiểm tra). Hãy thử lại; nếu vẫn lỗi, hãy kiểm tra kết nối mạng. |
| `online.copyFailed` | Couldn't copy: select the link and copy it by hand. | Không sao chép được: hãy chọn link rồi tự sao chép. |
| `app.startFail` | The game server could not start: {why} | Không khởi động được máy chủ trò chơi: {why} |
| `lan.network` | Couldn't reach the game server. Check the connection and try again. | Không kết nối được máy chủ trò chơi. Hãy kiểm tra kết nối rồi thử lại. |
| `lan.seatTaken` | That seat was just taken. | Chỗ này vừa có người chọn. |

### Admin (2)

| Key | EN | VI |
|---|---|---|
| `admin.csvFailed` | The export failed: the server could not make the CSV file. | Xuất thất bại: máy chủ không tạo được tệp CSV. |
| `admin.p.na` | n/a (the tests could not run) | n/a (không chạy được kiểm thử) |

## Deferred minors

Each was found in a task review and left, by ruling or because it cannot be seen in play. Search for the name if a line has moved.

### Quick mission and rules
- `buildQuickSchedule` (`src/engine.js:170`) hard-codes the drawn rounds `[3, 5, 6, 7]` instead of deriving them from `D.QUICK.flareTurn` and `D.QUICK.oxygenTurn`.
- The calm-round and no-storm Quick tests cover commander with 4 crew only.
- `schedulePatch` (`src/engine.js:422`) has no key validation; it is for the Showcase's own use.
- The test for `referenceKit`'s Quick kit pins that it fits the budget, not the figures.

### Saves, title and Resume (`src/ui.js`)
- Resume depends on storage alone: with blocked `localStorage`, a mission held in memory gets no Resume after Home.
- `resumeSlot` (`src/ui.js:235`) now clears the card on a switch, but per-mission `regionsSeen` state is shared with the slot it left; and Resume closing an unread Full card leaves that region marked seen.
- The `{end}` test for the lessons checks the Full side by the strings only.
- The Admin Best tile and the debrief charts' `xMax` for a Quick mission have no test; tick spacing on a Quick chart was not checked.
- `lesson.food` no longer gives "about 3.6 tonnes" (true for 500 sols only) and says "weighs tonnes" with no figure; a per-length figure could return.
- The kind key `c.type + ':' + c.kind` (`src/ui.js:454` at review time) would collapse a future card with no kind.

### Words and tests of words
- The Plains test's comment became `// X`; the `help.11` test's `/spare kit\b(?!s)/` is lower-case only; `srcA` reverse-looks-up the id on every call (`src/ui.js:75`); the pilot card's source is plain text; the plural keys of `goal.*` are left as they were; `/^haul./` in `I.t` has an unescaped dot (harmless).
- The copyright string hardcodes the name instead of reading `author` (a test checks that they agree).
- `lan.seatTaken` duplicates `lan.taken_err` (`src/i18n.js`, both languages).
- The noRoom / slowDown test mostly proves the strings exist; the no-menu check is a regex over `main.js`.
- The `.found-list` test is a regex over CSS; the lava-tube test pins the stops, not the darkness.

### Server, rooms and the app
- A reused room row keeps its old `meta.remote` (`lib/rooms.js:186-192`).
- `server.js` imports `privateIPv4` from `app/join.js`; it would sit better in `lib/`.
- `src/admin.js` still adds the fonts link itself.

### Surface and map (`src/surface*.js`, `src/ui.js`)
- `fogSent` is pruned only on socket open or `forgetFog` (`src/ui.js:159-174`); the fog cap bounds it.
- `r.shown` is not reset when a crewmate leaves the rover (`src/surface.js:851`), so the rover shows a brief swing from a stale angle.
- The console pause (`armCardTimer`, `src/ui.js:684`) leaves an already-open card up while the console shows.
- The pack's kit count is only in its aria-label; a pack of only kits has no "full" note yet a pickup says full.
- The repeated round brief can overwrite a different note set while a card was up (it fires only after a card closes).
- Stale comment at `test/surface.test.js:925`; the nose tests cover east, north and one pinch only.
- `src/ui.js` keeps its own `const TILE = 64` (`src/ui.js:1260`) beside the surface's tile size.

### The Showcase (`src/showcase.js`)
- `opsTab` is not in the `CARDS` shape: `view: 'console'` covers it, and `ui.js` has no console tab state.
- `show.open` is an extra key that the Admin link needs.
- `SolSurface.scene`, the scene's boarding refusal and the Admin Showcase link have no automated test (they were left to the browser pass).
- The flare 20 s test compares `flareStart` with the card's own clock through a fake surface; the real order is by code reading and the browser pass.
- `test/showcase.test.js:46`'s comment says "exactly as showScene builds it" but the helper omits `G.pick` (no effect found); the ground test restates the `REGION_PHOTO` names.

### Looked at and left, from the final review
- Saves that pass repair but crash on Resume (schedule removed, turn 9) were reproduced; the title stays usable and spec §3.7 leaves hand-edited saves out.
- A lying client sending `quick: 1` with 20 rounds is accepted and graded on Quick bands (spec §3.7 keeps the lying-client item as is).
- Removing the app menu also removes F11 and zoom (spec §3.4 allows it).
- Hiding VPN addresses also removes them from the `node server.js` console list (the same function as the lobby fix).
- `.show-cap` truncates a long purpose line to one line: a layout call for the browser pass.
- The Full-mission `D.SCIENCE.eva` stays 20 (see the M4d follow-ups' table), and the flat haul stays.

## Left out on purpose

From spec §2 and §3.7:
- Everything phone or touch (no phone or touch layout work in M5, upright or sideways).
- Test-only and code-only tidying: it stays on the follow-up lists.
- Co-op Quick missions: Quick is solo only.
- The explorer bot's internals.
- Hand-edited saves.
- Co-op races that need two rare failures together (the stale-position guard, tagging positions with the round).
- `D.SCIENCE.eva` stays 20; the lying-client and flat-haul items stay as they are.
- The Full mission's rules and balance: not one number moved.

Also not done at the time of this doc: the bigger base, upgrades over time, vehicle building and materials. The user asked for them on 2026-11-09 (20:43) and they are a separate project, in brainstorming.

## Hand checks the user must make

The sandbox has no internet. These carry over from M1 to M4d, and the Showcase run is new:
- A share-link game ends with an Online record that has the exploring counts.
- `https://<link>/admin` gives 404.
- The Live tab shows the share link and its QR code, and Stop sharing works.
- The CSV save dialog in the app.
- A ping and a beacon between two PCs over the share link.
- The Showcase run by the presenter on the installed app, as a rehearsal: all 12 cards, Show me and ‹ Showcase, in both languages.
- Also, from the task reviews, if the QA did not cover them: the browser-pass lines of Tasks 6 to 10 (the job-select star at max-width 190 px; the Admin CSV, sort, kept passwords, chart labels, n/a and ticks; map key glyphs and colours against the maps; the eyebrow on one line at 1280 px with card width 380; the card max-height against the HUD; grains repeating 200; offline fonts; the rover nose at diagonals and wall corners; the missing key cap; the map past 512 minis; round 2+ with a flare or storm brief and a region card opening in the first 8 s).
