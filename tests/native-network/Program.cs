using System;
using Trail.Runtime.Network;
static void Reject(Action action) { try { action(); } catch (ArgumentException) { return; } throw new Exception("Expected rejection"); }
var secure = new ConnectionPolicy("https://trail.example", false);
if (secure.Endpoint("/api/session").AbsoluteUri != "https://trail.example/api/session") throw new Exception("Wrong endpoint");
foreach (var origin in new[] { "http://trail.example", "http://127.0.0.1", "https://token@trail.example", "https://trail.example/api", "https://trail.example?token=secret" }) Reject(() => new ConnectionPolicy(origin, false));
foreach (var origin in new[] { "http://127.0.0.1:3401", "http://[::1]:3401", "http://localhost:3401" }) _ = new ConnectionPolicy(origin, true);
Reject(() => new ConnectionPolicy("http://localhost.evil.example", true));
foreach (var path in new[] { "//evil.example/api", "/api/../secret", "/api/%2e%2e/secret", "/api/session?token=secret", "/api/session#secret", "/outside" }) Reject(() => secure.Endpoint(path));
var session = new PairedSession(); var token = new string('a', 43); var id = Guid.NewGuid().ToString();
session.Accept(token, "learner", id, 5000, 1000);
if (!session.IsAvailable(4999) || session.IsAvailable(5000)) throw new Exception("Expiry failure");
var generation = session.Generation; session.Clear();
if (session.Token != null || session.IsAvailable(1000) || session.Generation <= generation) throw new Exception("Clear failure");
Reject(() => session.Accept(token, "admin", id, 5000, 1000));
Reject(() => session.Accept(token, "learner", id, double.NaN, 1000));
Reject(() => session.Accept("secret", "learner", id, 5000, 1000));
Reject(() => session.Accept(token, "learner", id, 999, 1000));
Console.WriteLine("PASS: native URL policy, credential validation, expiry and generation invalidation (actual pure C#, no Unity/network hardware).");
