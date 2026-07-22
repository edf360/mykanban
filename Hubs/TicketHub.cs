using Microsoft.AspNetCore.SignalR;

namespace KanbanServer.Hubs;

/// <summary>
/// チケット変更のリアルタイム通知用 Hub
/// </summary>
public class TicketHub : Hub
{
    /// <summary>
    /// チケットが変更されたことを全クライアントに通知
    /// 【BUG-14修正】Clients.All に変更し、Controller の NotifyTicketChanged() と一貫させる
    /// </summary>
    public async Task BroadcastTicketChanged()
    {
        await Clients.All.SendAsync("TicketChanged");
    }
}
