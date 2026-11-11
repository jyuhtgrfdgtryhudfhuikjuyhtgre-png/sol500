# SOL 500 M6 (3.8.0): follow-ups

What M6 left for later, what only the user can check, and the Vietnamese strings that still need a native read. Nothing was cut: all five tiers shipped (ranks and land, gear, Colony, the pressurised rover, the scout drone).

## For the user to decide

1. **The Science rover costs more than the Pressurized rover (900 kg against 600 kg).** A working Science rover also raises the EVA job's science (20 points against 8), so it is the stronger buy for the score: at 500 kg half of the thoughtful players who bought it got an S. At 900 / 600 an S comes 26-28 % of the time whichever is bought, or both. If the order of the prices reads wrong, the other lever is that science rule itself (a 3.7.0 rule, outside M6's tables).
2. **Outpost costs 500 kg, exactly what a mission starts with.** A player who upgrades in round 1 has no materials left for repairs once the spare kits are gone (a careless bot made to do this fell from 70 % to 14 % success on veteran). At 600 kg Station and Colony slip a round past their targets, so 500 stays. A warning on the row would be the fix; none was added.
3. **A drone can finish the "explore 4 chunks" goal from the base** with 2 of a round's 3 flights (15 science). Left as it is: scouting is what the drone is for.
4. **Colony opens two cards in a row** (the rank's, then the Colony's 8 s later). Not judged in a browser yet; drop the second from `M6_CARD_EVENTS` if it feels noisy.
5. **A rank card shows on the surface, not in the Mission console.** A player who upgrades from the console sees it when they next open the Surface tab.
6. **Still open from M4d:** a kit that lands with a rover gives a thoughtful explorer an S 81 % of the time (ruling R21). M6 did not change it.
7. **The installer is unsigned**, so other PCs show SmartScreen ("More info" → "Run anyway"). A real fix needs a paid code-signing certificate.

## Only the user can check

- A share-link game (through the internet) with the new vehicles: the pressurised rover with a passenger, a drone flight seen by the other player.
- A rehearsal of the five new Showcase cards in front of the screen the judges will see: ranks, Fabricator, launch, pressurised rover, drone.
- A stretch of a Full mission at a human pace: does reaching Outpost around rounds 5-7 feel right?
- The Vietnamese below.

## Not checked in a browser (unit tests cover the rules)

The science rover driven beside the pressurised one; buying each gear line and the launch through the console (the rows show); two co-op players queueing the same rank-up; E next to a pressurised rover idling inside the base (the ride offer may take the E key from a base menu); the frame rate inside a full Colony base against 3.7.0 (the Station and Outpost scenes read 161-165 fps); repaint identity; the offline file opened from disk. `release-qa-brief.md` in the M6 ledger folder lists them for one QA agent.

## Deferred minors

Player-visible:
- While a rank-up is queued or under way its row is disabled with the reason "Limit reached"; "already under way" would read better.
- The minimap, the full map and the painter's flat fallback still show the world's own tiles on a rank's new land.
- The console's self-sufficient line shows at Colony even when nothing is running.
- A save with `launched: true` and a damaged `launchBonus` repairs to 0, so its debrief reads "+0 science".
- `gear.tanks.fact` (MOXIE) is shown nowhere yet.
- Tile buttons' aria-labels read "0,3" or "-1,3" on the new land's negative spots (`src/ui.js`, the console map).
- "1 work" takes two rounds with one builder (an Engineer gives 0.9 a round); the report says "Construction started", which is 3.7.0's rule but may surprise on a rank-up.

Code and tests:
- "Which vehicle is this crew member in" is derived in several places (`inCabin` in surface-eva, `rides` in surface, lib/rooms.js); use `X.vehicleOf` everywhere.
- The next gear level is looked up twice (`gearHelp` and `E.costOf`); "needs a working {module}" is built twice (ui.js, surface.js).
- `D.EXPEDITION.baseZone` is read only by tests now and repeats `D.RANKS[0].zone`.
- `src/surface.js` recomputes a grid spot inline with a stand-in mission; reuse `worldToGrid`.
- `card.<key>.src` keeps a SOURCES key as an i18n string; card titles repeat rank names instead of `rank.*`; `bld.rover` repeats game numbers.
- No test: a building at a negative grid spot after a reload; rank 3 opening two cards; `sample_launch` opening `card.launch`; a rider not being drawn.
- Weak assertions in Task 4's tests (an empty fills list passes; a refill inside `if (pod)`).
- `raise` in `src/showcase.js` throws on an empty free-tile list (the scene then shows "failed", safely).
- `sources.md`: the `m6Isru` quote is a fragment; re-fetch it before any line leans on more than the definition of ISRU.
- Intermediate Task 1 commits fail the guide test (the end state is green).

## Vietnamese for a native read (every string new or changed since 3.7.0)

Terms agreed: the rover is "xe thám hiểm", the pressurised rover "xe thám hiểm điều áp", the base "căn cứ", the relay beacon "trạm chuyển tiếp".

**Base ranks (console rows, top bar, cards)** (22)

- `rank.camp`: Trại
- `rank.outpost`: Tiền đồn
- `rank.station`: Trạm
- `rank.colony`: Khu định cư
- `rank.next`: Cấp tiếp theo: {rank}
- `rank.unlocks`: Mở khóa: {list}, thêm đất và chỗ cho thêm công trình.
- `ops.rank`: Căn cứ: {rank}
- `mod.rankup`: Nâng cấp căn cứ
- `ev.rank_up.title`: Cấp mới: {rank}
- `ev.rank_up.body`: Căn cứ có thêm đất, với băng và đá riêng, và chỗ cho thêm công trình.
- `card.rank1.title`: Căn cứ thành Tiền đồn
- `card.rank1.body`: Ý tưởng Căn cứ Artemis của NASA hình dung một nơi ở cố định trên Mặt Trăng cho tối đa bốn phi hành gia. Mục tiêu là để phi hành đoàn ở lại trên bề mặt Mặt Trăng đến hai tháng mỗi lần.
- `card.rank1.src`: m6Basecamp
- `card.rank2.title`: Căn cứ thành Trạm
- `card.rank2.body`: Trong Cuộc thi Nơi ở in 3D của NASA, các đội đã in nơi ở từ những vật liệu có thể tìm thấy trên Mặt Trăng và sao Hỏa, bằng robot xây dựng với rất ít sự can thiệp của con người.
- `card.rank2.src`: m6Habitat3d
- `card.rank3.title`: Căn cứ thành Khu định cư
- `card.rank3.body`: Perseverance mang theo các ống mẫu: tối đa 38 ống sẽ được lấp đầy bằng đá và đất bề mặt sao Hỏa. Hãy xây bệ phóng, và phi hành đoàn của bạn có thể gửi mẫu của chính mình về Trái Đất.
- `card.rank3.src`: m6Samples
- `card.colony.title`: Căn cứ tự cung tự cấp
- `card.colony.body`: Khu định cư của bạn tự làm ra nhiều oxy, nước và thức ăn hơn. NASA gọi việc dùng vật liệu tại chỗ để làm ra những gì phi hành đoàn cần là “tận dụng tài nguyên tại chỗ” (ISRU), hay sống nhờ vào đất.
- `card.colony.src`: m6Isru

**The Garage, its vehicles and the drone (console and guide)** (12)

- `item.rover.name`: Xe thám hiểm
- `item.rover.fact`: Xe thám hiểm Opportunity của NASA được thiết kế để hoạt động 90 ngày sao Hỏa, nhưng đã làm việc lâu gấp 60 lần và đi được hơn 45 km.
- `mod.garage`: Xưởng xe
- `mod.cabin`: Xe thám hiểm điều áp
- `mod.drone`: Drone trinh sát
- `bld.garage`: Chế tạo phương tiện từ vật liệu và công sức của phi hành đoàn, trước hết là một xe thám hiểm của riêng bạn.
- `bld.cabin`: Xe thám hiểm có không khí bên trong: bộ đồ không hao oxy khi ngồi trong xe, xe đi xa gấp đôi và có hai chỗ ngồi.
- `bld.drone`: Bay qua vách đá và tường; vùng đất rộng quanh nó hiện trên bản đồ, để bạn thấy những thứ tìm được ở đó. Nó không chở gì.
- `bld.rover`: Xe thám hiểm của riêng bạn, làm từ kim loại sao Hỏa: EVA được 20 điểm khoa học mỗi người mỗi vòng thay vì 8. 1 kW.
- `guide.garage.fact`: Xe thám hiểm điều áp mà Xưởng xe chế tạo dựa trên một chiếc xe Nhật Bản đang làm cho các sứ mệnh Mặt Trăng Artemis của NASA. Chiếc xe đó sẽ chở được hai phi hành gia trong tối đa 30 ngày.
- `guide.cabin.fact`: Các kế hoạch lên sao Hỏa của NASA dùng xe thám hiểm điều áp cho những chuyến đi xa.
- `guide.drone.fact`: Trực thăng Ingenuity của NASA đã bay 72 lần trên sao Hỏa và làm trinh sát trên không cho các nhà khoa học và người lái xe thám hiểm Perseverance.

**The pressurised rover on the surface** (18)

- `eva.cabinAir`: Bạn đang thở không khí trong xe: bộ đồ không hao oxy.
- `eva.err.noCabin`: Xe thám hiểm điều áp đang không hoạt động.
- `eva.cabinBattery`: Pin xe thám hiểm điều áp
- `eva.cabinFlare`: ☢ Bão hạt Mặt Trời sắp tới: xe thám hiểm điều áp không che chắn được. Hãy vào căn cứ, hang, ống dung nham, khoang sinh hoạt hoặc hầm trú bão
- `sf.boardCabin`: Lái xe thám hiểm điều áp
- `sf.exitCabin`: Xuống xe thám hiểm điều áp
- `sf.cabinSub`: Bộ đồ không hao oxy khi ngồi trong xe
- `sf.key.cabin`: Xe thám hiểm điều áp đang đỗ
- `eva.cabinFlat`: Pin xe thám hiểm điều áp đã cạn đến ngày mai: nhấn E để xuống xe và đi bộ.
- `eva.err.cabinFlat`: Pin xe thám hiểm điều áp đã cạn đến ngày mai.
- `eva.err.cabinTaken`: Người khác đang lái xe thám hiểm điều áp.
- `card.cabin.title`: Trên xe thám hiểm điều áp
- `card.cabin.body`: Ở trong xe, bạn thở không khí của xe, nên bộ đồ không hao oxy. Xe thám hiểm điều áp của bạn dựa trên một chiếc xe Nhật Bản đang làm cho các sứ mệnh Mặt Trăng Artemis của NASA: theo thỏa thuận với NASA, Nhật Bản sẽ thiết kế, phát triển và vận hành nó, và nó sẽ chở được hai phi hành gia trong tối đa 30 ngày.
- `card.cabin.src`: m6Pressurized
- `sf.ride`: Đi cùng xe thám hiểm điều áp
- `eva.err.seatTaken`: Đã có người ngồi cùng trên xe thám hiểm điều áp.
- `show.card.cabin.name`: Xe thám hiểm điều áp
- `show.card.cabin.why`: Theo một thỏa thuận với NASA, Nhật Bản sẽ thiết kế, phát triển và vận hành một chiếc xe thám hiểm điều áp cho Mặt Trăng, chở được hai phi hành gia trong tối đa 30 ngày. Trong game, xe thám hiểm điều áp của bạn dựa trên chiếc xe Mặt Trăng đó: ở trong xe bạn thở không khí của xe, nên bộ đồ không hao oxy.

**The scout drone on the surface** (12)

- `card.drone.title`: Chuyến bay đầu tiên của drone trinh sát
- `card.drone.body`: Trực thăng Ingenuity của NASA đã bay 72 lần trên sao Hỏa và làm trinh sát trên không cho các nhà khoa học và người lái xe thám hiểm Perseverance.
- `card.drone.src`: m6Ingenuity
- `eva.droneFly`: Cho drone bay (còn {n} chuyến) · F
- `eva.droneCancel`: Hủy chuyến bay · Esc
- `eva.droneFlying`: Drone đang bay…
- `eva.droneAim`: Chọn nơi drone sẽ trinh sát: bấm xuống đất, hoặc trên bản đồ (M). Esc để hủy.
- `eva.droneAimMap`: Bấm vào trong vòng tròn, cách bạn tối đa {n} ô, nơi drone sẽ trinh sát · M hoặc Esc để đóng
- `eva.droneFlew`: Drone đã khám phá vùng đất trong phạm vi {n} ô quanh điểm đến và đang bay về.
- `eva.err.noDrone`: Không có drone trinh sát nào hoạt động: hãy chế tạo một chiếc ở Xưởng xe.
- `show.card.drone.name`: Drone trinh sát
- `show.card.drone.why`: Trực thăng Ingenuity của NASA đã bay 72 lần trên sao Hỏa và làm trinh sát trên không cho các nhà khoa học và người lái xe thám hiểm Perseverance. Trong game, drone trinh sát của bạn bay từ căn cứ hoặc từ xe thám hiểm bạn đang lái và khám phá vùng đất quanh điểm bạn chọn.

**The Fabricator and gear** (17)

- `mod.fabricator`: Máy chế tạo
- `bld.fabricator`: Chế tạo trang bị tốt hơn cho cả đội từ kim loại và băng: bình khí bộ đồ và ba lô lớn hơn, giá chở hàng cho xe thám hiểm, dụng cụ nhanh hơn.
- `mod.tanks`: Bình khí bộ đồ lớn hơn
- `mod.backpack`: Ba lô lớn hơn
- `mod.racks`: Giá chở hàng cho xe
- `mod.tools`: Dụng cụ nhanh hơn
- `guide.fabricator.fact`: Năm 2014, một máy in 3D trên Trạm Vũ trụ Quốc tế đã làm ra vật thể in 3D đầu tiên trong không gian, để cho thấy nó có thể làm ra linh kiện và dụng cụ ở đó.
- `gear.tanks`: Bình khí bộ đồ lớn hơn
- `gear.backpack`: Ba lô lớn hơn
- `gear.racks`: Giá chở hàng cho xe
- `gear.tools`: Dụng cụ nhanh hơn
- `gear.level`: cấp {n} / 2
- `gear.tanks.help`: Mỗi bộ đồ có thêm giây khí thở: {s} giây. Bộ đồ đang dùng giữ nguyên số giây còn lại.
- `gear.backpack.help`: Mọi người mang được nhiều tải hơn khi đi bộ: {n}.
- `gear.racks.help`: Xe thám hiểm chở được nhiều tải hơn: {n}.
- `gear.tools.help`: Mỗi lần giữ phím mất ít thời gian hơn: {p} % so với hiện nay.
- `gear.tanks.fact`: Trên Perseverance, thiết bị MOXIE của NASA đã tạo oxy từ khí cacbonic trong không khí sao Hỏa: tổng cộng 122 g.

**Colony: the launch pad, the launch, self-sufficiency** (15)

- `mod.launchpad`: Bệ phóng gửi mẫu về Trái Đất
- `bld.launchpad`: Mỗi nhiệm vụ một lần, gửi các mẫu khoa học bạn thu được trên bản đồ về Trái Đất để được thêm điểm khoa học.
- `bld.launch`: Phóng các mẫu khoa học bạn thu được trên bản đồ về Trái Đất để được thêm điểm khoa học. Mỗi nhiệm vụ một lần.
- `mod.launch`: Phóng mẫu về Trái Đất
- `card.launch.title`: Mẫu vật đang trên đường về Trái Đất
- `card.launch.body`: Các mẫu bạn thu được đã được phóng về Trái Đất, để được thêm điểm khoa học. Các ống mẫu của Perseverance được dùng để mang những mẫu vật đầu tiên trong lịch sử từ một hành tinh khác về Trái Đất.
- `card.launch.src`: m6Samples
- `guide.launchpad.fact`: Perseverance mang theo các ống mẫu: tối đa 38 ống sẽ được lấp đầy bằng đá và đất bề mặt sao Hỏa, để mang những mẫu vật đầu tiên trong lịch sử từ một hành tinh khác về Trái Đất.
- `ops.selfSufficient`: Căn cứ tự cung tự cấp: tự làm ra nhiều oxy, nước và thức ăn hơn.
- `deb.launch`: Vụ phóng mẫu đã gửi phát hiện của căn cứ về Trái Đất: +{n} điểm khoa học.
- `deb.selfSufficient`: Một Thuộc địa tự cung tự cấp: tự làm ra nhiều oxy, nước và thức ăn hơn.
- `ev.sample_launch.title`: Đã phóng mẫu
- `ev.sample_launch.body`: Mẫu vật đang trên đường về Trái Đất: +{bonus} điểm khoa học.
- `show.card.launch.name`: Phóng mẫu về Trái Đất
- `show.card.launch.why`: Perseverance mang theo các ống mẫu: tới 38 ống sẽ được lấp đầy đá và bụi đất sao Hỏa, để mang những mẫu đầu tiên trong lịch sử từ một hành tinh khác về Trái Đất. Trong game, bệ phóng của Khu định cư gửi các mẫu bạn đã tích lũy về Trái Đất để nhận điểm khoa học thưởng.

**Showcase cards** (5)

- `show.card.ranks.name`: Các cấp căn cứ
- `show.card.ranks.why`: Trong cuộc thi Nơi ở in 3D của NASA, các đội in nơi ở từ vật liệu có thể tìm thấy trên Mặt Trăng và sao Hỏa, bằng cách xây dựng bằng robot với rất ít sự can thiệp của con người. Trong game, cấp càng cao thì căn cứ của bạn càng có nhiều đất và chỗ cho thêm công trình.
- `show.ranks.line`: Căn cứ cấp {rank}. Đã mở khóa: {list}.
- `show.card.fabricator.name`: Máy chế tạo
- `show.card.fabricator.why`: Năm 2014, máy in 3D trên Trạm Vũ trụ Quốc tế đã làm ra vật thể in 3D đầu tiên trong không gian, để cho thấy nó có thể làm ra các bộ phận và dụng cụ ngay tại đó. Trong game, Máy chế tạo làm bình khí bộ đồ lớn hơn, ba lô lớn hơn, giá chở hàng cho xe thám hiểm và dụng cụ nhanh hơn.

**Other screens** (13)

- `sf.baseLand`: Đất căn cứ
- `bld.why.needs`: Cần {module} đang hoạt động
- `bld.why.water`: Thiếu nước
- `bld.costWater`: {kg} kg · {water} kg nước · {w} công
- `card.eyebrow`: Cột mốc
- `guide.tanks.desc`: Làm trong Máy chế tạo: mỗi bộ đồ của cả đội có thêm giây khí thở.
- `eva.err.inVehicle`: Hãy xuống chiếc xe bạn đang ngồi trước đã.
- `eva.err.notDriven`: Lúc này không ai lái xe thám hiểm điều áp.
- `eva.err.notRiding`: Bạn đang không ngồi trên xe thám hiểm điều áp.
- `eva.err.grounded`: Drone không thể bay trong bão bụi toàn cầu.
- `eva.err.flights`: Pin drone đã cạn đến ngày mai.
- `eva.err.notHere`: Chỉ cho drone bay từ căn cứ hoặc từ xe thám hiểm bạn đang lái.
- `eva.err.fogFull`: Bản đồ không nhận thêm vùng mới từ bạn trong nhiệm vụ này.

**NASA source titles** (8)

- `m6Basecamp`: NASA (2020): Cuộc sống trên Mặt Trăng: ý tưởng Căn cứ Artemis của NASA
- `m6Habitat3d`: NASA (2019): Các đội in 3D nơi ở hành tinh, nhận 700 nghìn USD trong cuộc thi của NASA
- `m6Isru`: NASA: Tổng quan: Tận dụng tài nguyên tại chỗ (sống nhờ vào đất)
- `m6Pressurized`: NASA (2024): NASA và Nhật Bản tăng cường hợp tác vũ trụ, ký thỏa thuận về xe thám hiểm Mặt Trăng
- `m6Ingenuity`: NASA (2024): Sau ba năm trên sao Hỏa, sứ mệnh trực thăng Ingenuity của NASA kết thúc
- `m6Moxie`: NASA (2023): Thí nghiệm tạo oxy MOXIE của NASA hoàn thành sứ mệnh trên sao Hỏa
- `m6Samples`: NASA: Chuyến khứ hồi sao Hỏa: các ống mẫu của xe thám hiểm Perseverance
- `m6Printing`: NASA (2014): Mở cửa kinh doanh: máy in 3D tạo ra vật thể đầu tiên trong không gian trên Trạm Vũ trụ Quốc tế
