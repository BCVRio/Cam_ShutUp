#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Goal.h"
#include "BotPlayer.generated.h"

class AFootball; class UAnimSequence;
UENUM(BlueprintType) enum class EBotRole : uint8 { Outfield, Keeper };

// Team-mates and Rovers: a compact state machine (chase / support / keeper) driven through the character movement,
// so they use the same physics and animation path as Cam. Behaviour Trees can replace Think() later without touching the rest.
UCLASS(Config=Game)
class NUNHEADGTA_API ABotPlayer : public ACharacter
{
	GENERATED_BODY()
public:
	ABotPlayer();
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Bot") ETeam Team = ETeam::Away;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Bot") EBotRole Role = EBotRole::Outfield;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Bot") float Speed = 520.f;
	UPROPERTY(Config) FString HomeMeshPath; UPROPERTY(Config) FString AwayMeshPath; UPROPERTY(Config) FString KeeperMeshPath;
	UPROPERTY(BlueprintReadOnly, Category="Bot") FVector HomeSpot;
	void ReturnHome();
protected:
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	void Think(float Dt);
	void MoveToward(const FVector& Target, float SpeedScale);
	UPROPERTY() TObjectPtr<AFootball> Ball = nullptr; UPROPERTY() TObjectPtr<AGoal> TargetGoal = nullptr; UPROPERTY() TObjectPtr<AGoal> OwnGoal = nullptr;
	float Cooldown = 0.f; float Phase = 0.f;
	UPROPERTY() UAnimSequence* IdleAnim = nullptr; UPROPERTY() UAnimSequence* RunAnim = nullptr; UPROPERTY() UAnimSequence* CurrentClip = nullptr;
	void PlayClip(UAnimSequence* Clip);
};
